import pandas as pd
import json
import os
import sys
from datetime import date


if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))


#Direccionamiento del archivo Excel
archivo_excel = os.path.join(BASE_DIR, "Descargas/ticket", "reporte_incidentes.xlsx")
archivo_json = os.path.join(BASE_DIR, "datos_tickets.json")
#ARCHIVO_HTML_TEMPLATE = os.path.join(BASE_DIR, "grafica_supervisores_template.html")
#ARCHIVO_HTML_SALIDA   = os.path.join(BASE_DIR, "grafica_supervisores.html")



#Verificacion de archivo existente
if not os.path.exists(archivo_excel):
    print(f"El archivo {archivo_excel} no existe.")
    exit()

print("Archivo encontrado, procesando...")
df = pd.read_excel(archivo_excel)
print(f" {len(df)} fila encontradas verificacion")

#Creacion de categorais
df["Creado"] = pd.to_datetime(df["Creado"], errors="coerce")
df["Completado"] = pd.to_datetime(df["Completado"], errors="coerce")
df["Cerrado"] = pd.to_datetime(df["Cerrado"], errors="coerce")


df["mes"] = df["Creado"].dt.to_period("M").astype(str)


hoy = pd.Timestamp(date.today())
#Calculo de dias de tickets sin cerrar
def Calcular_dias(row):
    
    if pd.notna(row["Cerrado"]) and pd.notna((row["Creado"])):
        dias = (row["Cerrado"] - row["Creado"]).days
    elif pd.notna(row["Creado"]):
        dias = (hoy - row["Creado"]).days
    else:
        dias = 0
    return max(0, int(dias))

df["DIAS TRANSCURRIDOS"] = df.apply(Calcular_dias, axis=1)

#Creacion de usuarios "REQUIERE ACTUALIZAR"
def asignar_supervisor(row):
    das         = str(row.get("DAS", "")).strip()
    estado      = str(row.get("Estado", "")).strip()
    ciudad      = str(row.get("Ciudad", "")).strip()
    direccion   = str(row.get("Dirección", "")).strip()
    inmueble    = str(row.get("Inmueble", "")).strip()


    if das == "DAS DOPAJ 01": return "EDGAR OLEGARIO"
    if das == "DAS DOPAJ 02": return "ALEJANDRO DODAI"
    if das == "DAS DOPAJ 03": return "ROGELIO ÁLVAREZ"
    if das == "DAS DOPAJ 04": return "AMERICA ROMERO"
    if das == "DAS DOPAJ 05": return "VICTOR CARMONA"
    if das == "DAS DOPAJ 06": return "ALEJANDRO DODAI"
    if das == "DAS DOPAJ 07": return "ISAAC DOMÍNGUEZ"
    if das == "DAS DOPAJ 08": return "JOEL MORENO"
    if das == "DAS DOPAJ 09":
        if ciudad == "Iguala de La Independencia" or ciudad == "Chilpancingo de Los Bravo":
            return " Gregorich"
        else:
            return "ISMAEL TAPIA"
    if das == "DAS DOPAJ 10": return "SERGIO MARTÍNEZ"
    #return das

#Creacion de apartado de supervisor
df["SUPERVISOR"] = df.apply(asignar_supervisor, axis=1)


print("debug 1")

#COL_ID = next(
#    (c for c in df.columns if "sharp" in c.lower() or "incidente" in c.lower()),
#    df.columns[0]
#)

tickets_mes = df["mes"].value_counts().sort_index().tail(12)
tickets_status = df["Status"].value_counts()

print(tickets_status)

#Funcion a depurar el excel de la pagina no contempla lo que se requiere
sla = df["Cumplimiento SLA (BETA)"].value_counts()
sla_cumple = int(sla.get(True, 0))
sla_no_cumple = int(sla.get(False, 0))
sla_total = sla_cumple + sla_no_cumple
sla_pct = round(sla_cumple / sla_total * 100, 1) if sla_total > 0 else 0
#Creacion de ciudades
top_ciudades = df["Ciudad"].value_counts().head(10)
#Creacion de  categorias "Activo, Cerrado Resuelto"
categorias = df["Categoría"].value_counts().head(8)
#Contabilizador de Tickets
total = len(df)
cerrados = int(tickets_status.get("Cerrado", 0))
print(cerrados)
activos = int(tickets_status.get("Activo", 0))
print(activos)
resueltos = int(tickets_status.get("Resuelto", 0))
print(resueltos)
#Depuracion
df_sup = df[df["SUPERVISOR"].notna() & (df["SUPERVISOR"].str.strip() != "")]
sup_raw = (
    df_sup.groupby("SUPERVISOR")
    .agg(
        total = ("Incidente Sharp", "count"),
        completados = ("Completado", lambda x: x.notna().sum()),
        cerrado_cnt= ("Cerrado", lambda x: x.notna().sum()),
        dias_prom = ("DIAS TRANSCURRIDOS", "mean"),
        dias_max = ("DIAS TRANSCURRIDOS", "max"),
    )
    .reset_index()
    .sort_values("total", ascending=False)
)

#Detalles de la lista con detalles del supervisor total de tickets
supervisores_lista = [
    {
        "supervisor": row["SUPERVISOR"],
        "total": int(row["total"]),
        "completados": int(row["completados"]),
        "cerrados": int(row["cerrado_cnt"]),
        "dias_prom": round(row["dias_prom"], 1),
        "dias_max": int(row["dias_max"]),
    }
    for _, row in sup_raw.iterrows()
]
#Clasificaion
def clasificar_status(s):
    if s == "Activo":
        return "Activo"
    elif s == "Resuelto":
        return "Resuelto"
    elif s == "Cerrado":
        return "Cerrado"
    else:
        return None
    
df["status_grafica"] = df["Status"].apply(clasificar_status)


df_det = df[
    df["SUPERVISOR"].notna() &
    (df["SUPERVISOR"].str.strip() != "") &
    df["status_grafica"].notna() &
    df["Creado"].notna()
].copy()

#Normalizacion de fechas
df_det["fecha_str"] = df_det["Creado"].dt.strftime("%Y-%m-%d")
df_det["fecha_cierre_str"] = df_det["Cerrado"].dt.strftime("%Y-%m-%d").where(df_det["Cerrado"].notna(), None)
df_det["fecha_completado_str"] = df_det["Completado"].dt.strftime("%Y-%m-%d").where(df_det["Completado"].notna(), None)

#si existe el ticket regresa una cadena
def safe_str(val):
    if pd.isna(val):
        return ""
    return str(val).strip()

tickets_detalle = []
#Numero de tickets
for _, row in df_det.iterrows():
    incidente_sharp = safe_str(row.get("Incidente Sharp", ""))
    incidente_isste = safe_str(row.get("Incidente Cliente", ""))
#parte esencial para el apartado de la informacion de tickets 
    tickets_detalle.append({
        "supervisor":           row["SUPERVISOR"],
        "status":               row["status_grafica"],
        "fecha":                row["fecha_str"],
        "fecha_completado":     row["fecha_completado_str"],
        "fecha_cierre":         row["fecha_cierre_str"],

        "tickets_sharp":        incidente_sharp,
        "tickets_isste":        incidente_isste,
        "ciudad":               safe_str(row.get("Ciudad", "")),
        "estado":               safe_str(row.get("Estado", "")),
        "inmueble":             safe_str(row.get("Inmueble", "")),
        "descripcion":          safe_str(row.get("Descripción", "")),
    })
    

print("debug 2")
#parte exencial para la grafica de tickets por supervisor
df_activos = df_det[df_det["status_grafica"] == "Activo"].copy()
activos_por_estado = df_activos["Estado"].value_counts()

datos = {
    "kpis": {
        "total":    total,
        "cerrados": cerrados,
        "activos":  activos,
        "resueltos": resueltos,
        "sla_pct":  sla_pct
    },
    "tickets_por_mes": {
        "labels": tickets_mes.index.tolist(),
        "data":   tickets_mes.values.tolist()
    },
    "status": {
        "labels": tickets_status.index.tolist(),
        "data":   [int(v) for v in tickets_status.values]
    },
    "sla": {
        "cumple":    sla_cumple,
        "no_cumple": sla_no_cumple
    },
    "ciudades": {
        "labels": top_ciudades.index.tolist(),
        "data":   top_ciudades.values.tolist()
    },
    "categorias": {
        "labels": categorias.index.tolist(),
        "data":   categorias.values.tolist()
    },
    "supervisores": supervisores_lista,
    "tickets_detalle": tickets_detalle,

    "activos_por_estado": {
        "labels": activos_por_estado.index.tolist(),
        "data": [int(v) for v in activos_por_estado.values]
    }    


    #"tickets_detalle": tickets_detalle
}

#Guarda JSON de respaldo
with open(archivo_json, "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False, indent=2)

"""
#Genera html  (inyecta los datos dentro del template) 
if os.path.exists(ARCHIVO_HTML_TEMPLATE):
    with open(ARCHIVO_HTML_TEMPLATE, "r", encoding="utf-8") as f:
        html = f.read()
 
    # Reemplazamos el marcador __DATOS_JSON__ con los datos reales
    json_str = json.dumps(datos, ensure_ascii=False)
    html = html.replace("__DATOS_JSON__", json_str)
 
    with open(ARCHIVO_HTML_SALIDA, "w", encoding="utf-8") as f:
        f.write(html)
 
    print(f" HTML actualizado: {ARCHIVO_HTML_SALIDA}")
else:
    print(f" No encontré {ARCHIVO_HTML_TEMPLATE}, solo se generó el JSON.")

    """
#informacion
print(f"   JSON generado   : {archivo_json}")
print(f"   Total tickets   : {total:,}")
print(f"   Cerrados        : {cerrados:,}")
print(f"   Activos         : {activos:,}")
print(f"   Resueltos       : {resueltos:,}")
print(f"   Cumplimiento SLA: {sla_pct}%")
print(f"   Supervisores    : {len(supervisores_lista)}")

#input("\nProceso finalizado. Enter para continuar")
