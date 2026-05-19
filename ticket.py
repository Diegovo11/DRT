#Script para descargar automaticamente los archivos de la plataforma de tickets
#NOTA: EL SCRIPT BORRA TODOS LOS ARCHIVOS DE LA CARPETA DPONDE SE GUARDA EL EXCEL DE TICKETS
#RENOMBRA EL ARCHIVO PARA MAYIOR COMODIDAR VERIFICAR EN EL CODIGO 

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import time
import os
import sys
import glob
from datetime import datetime



#Creacion de .exe
#pyinstaller --onefile --console --hidden-import=selenium.webdriver.chrome.options --hidden-import=selenium.webdriver.chrome.service --hidden-import=selenium.webdriver.chrome.webdriver --hidden-import=selenium.webdriver.common.by --hidden-import=selenium.webdriver.support.ui --hidden-import=selenium.webdriver.support.expected_conditions --hidden-import=selenium.webdriver.common.action_chains --hidden-import=webdriver_manager.chrome ticket.py

#Ruta Dinamica
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

download_dir = os.path.join(BASE_DIR, "Descargas/ticket")

#Funcion para limpiar los archivos de la carpeta 
def limpiar_archivos(directorio):
    print(directorio)
    archivos = glob.glob(os.path.join(directorio, "*"))
    for f in archivos:
        #print("for")
        try:
            if os.path.isfile(f):
                os.remove(f)
                print("Archivo Eliminado")
        except Exception as e:
            print("Error al eliminar")

#Funcion de espera de descarga para cerrar la secion y navegador
def esperar_descarga(directorio, timeout=120):
    fin = time.time() + timeout
    while time.time() < fin:
        archivos_temp = glob.glob(os.path.join(directorio, "*.crdownload"))
        archivos_excel = glob.glob(os.path.join(directorio, "*.xls*"))
        
        if archivos_excel and not archivos_temp:
            archivo = max(archivos_excel, key=os.path.getctime)
            print(f"Archivo: {archivo}")
            return archivo
        time.sleep(5)
    return None


os.makedirs(download_dir, exist_ok=True)

limpiar_archivos(download_dir)

#Configuracion de navegador
options = webdriver.ChromeOptions()
#Opcion de prueba mantiene el navegador abierto
#options.add_experimental_option("detach", True)
options.add_experimental_option("prefs", {
    "download.default_directory": download_dir,
    "download.prompt_for_download": False,
    "download.directory_upgrade": True,
})


service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service, options=options)

wait = WebDriverWait(driver, 15)

#URL
driver.get("https://sharp-mx.ivantism.com/HEAT/")

#Username
wait.until(EC.presence_of_element_located((By.ID, "UserName"))).send_keys("arturo.morales")

#Paswoord
driver.find_element(By.ID, "Password").send_keys("Arturo.9876")

#Boton submit
driver.find_element(By.XPATH, "//button[@type='submit']").click()

print("Login")
#Direccionamiento a incidentes
wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Incidente')]"))).click()

print("Incidente")
#Tiempo de espera para que termine de cargar la pagina
time.sleep(10)
#Verificacion de frame
print(len(driver.find_elements(By.TAG_NAME, "iframe")))
#Cambio de frame
driver.switch_to.frame(0)

btn = wait.until(EC.visibility_of_element_located(
    (By.XPATH, "//button[contains(@style,'Excel.png')]")
))
#Click para descargar el Excel
actions = ActionChains(driver)
actions.move_to_element(btn).pause(1).click().perform()

print("excel")
#Primer Si de confirmación
time.sleep(2)
wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Sí')]"))).click()
print("primero")
#Segundo Si de confirmacion con tiempo de espera para el cambio 
time.sleep(2)
wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Sí')]"))).click()
print("segundo")
#regresamos al frame principal
driver.switch_to.default_content()
#
archivo_descargado = esperar_descarga(download_dir)
#renombramos el archivo
if archivo_descargado:
    nuevo_nombre = os.path.join(download_dir, f"reporte_incidentes.xlsx")
    
    os.rename(archivo_descargado, nuevo_nombre)
    print(f"Archivo renombrado")

else:
    print("No se pudo descargar.")

#salir del navegador
driver.quit()
print("Navegador cerrado")
