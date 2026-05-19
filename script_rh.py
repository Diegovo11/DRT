import pandas as pd
import json
import os
import sys
from datetime import date, time

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

archivo_directorio = os.path.join(BASE_DIR, "descargas", "directorio.xlsx")
archivo_horas = os.path.join(BASE_DIR, "descargas", "asistencia.xlsx")
archivo_incidencias = os.path.join(BASE_DIR, "descargas", "incidenciasFiscoclic.xlsx")
archivo_json = os.path.join(BASE_DIR, "datos_directorio.json")

for archivo in [archivo_directorio, archivo_horas, archivo_incidencias]:
    if not os.path.exists(archivo):
        print(f"No encontrado {archivo}")
        exit()

HORA_AUTOMATICA = time(23, 59, 0)

def obtener_salida_real(salidas_del_dia: pd.Series) -> str:
    salidas = salidas_del_dia.dropna()
    if salidas.empty:
        return ""

    
    #print(f"\n--- obtener_salida_real ---")
    #for s in salidas:
    #    print(f"  valor={s}  type={type(s)}  .time()={s.time() if hasattr(s, 'time') else 'N/A'}")
    #print(f"  HORA_AUTOMATICA={HORA_AUTOMATICA}  type={type(HORA_AUTOMATICA)}")

    salidas_normales = salidas[
        salidas.apply(lambda x: x.time()) < HORA_AUTOMATICA
    ]
    tiene_automatica = any(s.time() == HORA_AUTOMATICA for s in salidas)

    #print(f"  salidas_normales count={len(salidas_normales)}")
    #print(f"  tiene_automatica={tiene_automatica}")

    if tiene_automatica and not salidas_normales.empty:
        return salidas_normales.apply(lambda x: x.time()).max().__format__("%H:%M")
    elif not salidas_normales.empty:
        return salidas_normales.apply(lambda x: x.time()).max().__format__("%H:%M")
    else:
        return "23:59"


def formato_hora(val):
    if pd.isna(val):
        return ""
    try:
        t = pd.to_datetime(str(val), errors="coerce")
        if pd.isna(t):
            return str(val).strip()
        return t.strftime("%H:%M")
    except:
        return str(val).strip()

try:
    #Directorio
    df_dir = pd.read_excel(archivo_directorio, sheet_name="PERSONAL", usecols="B:M", header=1)
    df_dir.columns = [str(c).strip() for c in df_dir.columns]

    columnas_dir = ["Nombre completo", "Numero de empleado", "Supervisor", "Puesto", "ESTADO", "Entrada", "Salida"]

    columnas_dir = [c for c in columnas_dir if c in df_dir.columns]

    df_dir = df_dir[columnas_dir].copy()
    for col in df_dir.columns:
        df_dir[col] = df_dir[col].astype(str).str.strip()

    df_dir = df_dir[df_dir["Nombre completo"].str.lower() != "nan"]
    df_dir = df_dir[df_dir["Nombre completo"].str.strip() != ""]

    print(f"Directorio: {len(df_dir)} empleados")

    #Raw Timesheets (primera entrada)
    df_horas = pd.read_excel(archivo_horas,sheet_name="Raw Timesheets", header=1)
    df_horas.columns = [str(c).strip() for c in df_horas.columns]

    columnas_horas = ["Fecha", "Día", "Código de miembro", "Primera entrada", "Última salida"]
    #faltantes_h = set(columnas_horas) - set(df_horas.columns)
    #if faltantes_h:
    #    print("columnas no encontradas {faltantes_h}")
    #    print(f"Disponibles: {df_horas.columns.tolist()}")

    df_horas = df_horas[[c for c in columnas_horas if c in df_horas.columns]].copy()

    df_horas["Código de miembro"] = df_horas["Código de miembro"].astype(str).str.strip()
    df_horas["Fecha"] = pd.to_datetime(df_horas["Fecha"], errors="coerce")
    df_horas["fecha_str"] = df_horas["Fecha"].dt.strftime("%d/%m/%Y")
    if "Primera entrada" in df_horas.columns:
        df_horas["Entrada_h"] = df_horas["Primera entrada"].apply(formato_hora)
    print(f"registro de hora: {len(df_horas)}")


    # salida real + ubicacion
    try: 
        df_entries = pd.read_excel(archivo_horas, sheet_name="Raw Time Entries", header=1)
        df_entries.columns = [str(c).strip() for c in df_entries.columns]

        df_entries["Código de miembro"] = (
            df_entries["Código de miembro"].astype(str).str.strip()
            .replace(r'\.0$', '', regex=True)
        )
        df_entries["Fecha"] = pd.to_datetime(df_entries["Fecha"], errors="coerce")
        df_entries["fecha_str"] = df_entries["Fecha"].dt.strftime("%d/%m/%Y")

        col_hora_entry = "Hora" if "Hora" in df_entries.columns else None
        col_tipo_entry = "Tipo de entrada" if "Tipo de entrada" in df_entries.columns else None

        if col_hora_entry and col_tipo_entry:
            df_entries[col_hora_entry] = pd.to_datetime(
                df_entries[col_hora_entry], errors="coerce"
            )
 
            df_out = df_entries[
                df_entries[col_tipo_entry].astype(str).str.strip().str.lower() == "out"
            ].copy()

            salida_real_map = {}
            for (codigo, fecha), group in df_out.groupby(["Código de miembro", "fecha_str"]):
                salida_real_map[(codigo, fecha)] = obtener_salida_real(group[col_hora_entry])

            
            #ubicacion
            col_ubi  = "Ubicación del registro de entrada"
            col_dire = "Dirección del registro de entrada"
            df_ubi = df_entries.copy()
            df_ubi = df_ubi.drop_duplicates(subset=["Código de miembro", "fecha_str"], keep="first")

        else:
            print(f"Columnas de hora y tipo no encontradas en Raw Time Entries: {df_entries.columns.tolist()}")
            salida_real_map = {}
            df_ubi = pd.DataFrame()
            
    except Exception as e:
        print(f"No se cargó correctamente Raw Time Entries: {e}")
        salida_real_map = {}
        df_ubi = pd.DataFrame()


    df_inc = pd.read_excel(archivo_incidencias, sheet_name="Respuestas de formulario 1", header=0)

    df_inc.columns = [str(c).strip() for c in df_inc.columns]

    columnas_inc = ["Marca temporal", "Numero de empleado", "Describa el reporte", "Comentario"]

    
    columnas_presentes = [c for c in columnas_inc if c in df_inc.columns]
    df_inc = df_inc[columnas_presentes].copy()

    df_inc["Numero de empleado"] = df_inc["Numero de empleado"].astype(str).str.strip().replace(r'\.0$', '', regex=True)
    df_inc["Marca temporal"] = pd.to_datetime(df_inc["Marca temporal"], errors="coerce")
    df_inc["fecha_inc_str"] = df_inc["Marca temporal"].dt.strftime("%d/%m/%Y")

    if "Describa el reporte" in df_inc.columns:
        df_inc["Describa el reporte"] = df_inc["Describa el reporte"].astype(str).str.strip().replace('nan', '')
    if "Comentario" in df_inc.columns:
        df_inc["Comentario"] = df_inc["Comentario"].astype(str).str.strip().replace('nan', '')

    resultado = []
    for _, emp in df_dir.iterrows():
        num_id = str(emp.get("Numero de empleado", "")).strip()
        horas_emp = df_horas[df_horas["Código de miembro"] == num_id]

        if horas_emp.empty:
            resultado.append({**emp.to_dict(), "dias": []})
            continue

        dias_lista = []
        for _, hora in horas_emp.iterrows():
            fecha_str = hora.get("fecha_str", "")

            
            inc_match = df_inc[(df_inc["Numero de empleado"] == num_id) & (df_inc["fecha_inc_str"] == fecha_str)]
            descripcion = inc_match.iloc[0]["Describa el reporte"] if not inc_match.empty and "Describa el reporte" in inc_match.columns else ""
            comentario = inc_match.iloc[0]["Comentario"] if not inc_match.empty and "Comentario" in inc_match.columns else ""
            
            
            ubi_nombre, ubi_dir = "", ""
            if not df_ubi.empty and "Código de miembro" in df_ubi.columns:
                ubi_match = df_ubi[(df_ubi["Código de miembro"] == num_id) & (df_ubi["fecha_str"] == fecha_str)]
                if not ubi_match.empty:
                    if "Ubicación del registro de entrada" in ubi_match.columns:
                        ubi_nombre = str(ubi_match.iloc[0]["Ubicación del registro de entrada"]).strip()
                    if "Dirección del registro de entrada" in ubi_match.columns:
                        ubi_dir = str(ubi_match.iloc[0]["Dirección del registro de entrada"]).strip()
            
            
            salida_h = salida_real_map.get((num_id, fecha_str), "")
            if not salida_h and "Última salida" in hora.index:
                salida_h = formato_hora(hora["Última salida"])
            
            if descripcion == "nan": descripcion = ""
            if comentario == "nan": comentario = ""
            if ubi_nombre == "nan": ubi_nombre = ""
            if ubi_dir == "nan": ubi_dir = ""

            dias_lista.append({
                "fecha":       fecha_str,
                "Día":         str(hora.get("Día", "")).strip(),
                "Entrada_h":   hora.get("Entrada_h", ""),
                "Salida_h":    salida_h,
                "Descripcion": descripcion,
                "Comentario":  comentario,
                "Ubicacion":   ubi_nombre, 
                "Direccion":   ubi_dir     
            })
 
        resultado.append({**emp.to_dict(), "dias": dias_lista})

    # Guardar y generar HTML
    with open(archivo_json, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    """
    ARCHIVO_HTML_TEMPLATE = os.path.join(BASE_DIR, "grafica_asistencia_template.html")
    ARCHIVO_HTML_SALIDA   = os.path.join(BASE_DIR, "grafica_asistencia.html")

    if os.path.exists(ARCHIVO_HTML_TEMPLATE):
        with open(ARCHIVO_HTML_TEMPLATE, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace("__DATOS_JSON__", json.dumps(resultado, ensure_ascii=False))
        with open(ARCHIVO_HTML_SALIDA, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"✔ HTML generado exitosamente.")
    """
except Exception as e:
    print(f"Error: {e}")
    raise