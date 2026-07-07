import openpyxl
import json

SRC = '/Users/vpconsulting/Library/CloudStorage/OneDrive-VPConsulting/VP/Consolidado Anual de Evaluación de Desempeño - Mau.xlsx'

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb['MRO - Merlín']
rows = list(ws.iter_rows(values_only=True))

individuales = []
roles = {}
seccion = None
rol_actual = None

for r in rows:
    vals = [str(v).strip() for v in r if v is not None and str(v).strip()]
    if not vals:
        continue
    joined = ' '.join(vals)

    if joined.startswith('Sección individual'):
        seccion = 'ind'
        continue
    if joined.startswith('Sección de evaluación de Rol'):
        seccion = 'rol'
        continue
    if joined.startswith('Sección de Retroalimentación'):
        break

    # El índice numérico del reactivo vive en la columna B (r[1]), no en A —
    # columna A viene vacía en todo el archivo.
    es_reactivo_numerado = isinstance(r[1], (int, float))

    if seccion == 'ind' and es_reactivo_numerado and len(vals) >= 2:
        individuales.append(vals[1])
    elif seccion == 'rol':
        is_rol_header = vals[0].endswith(':') and not es_reactivo_numerado
        if is_rol_header:
            rol_actual = vals[0].rstrip(':')
            if rol_actual != 'PROMEDIO':
                roles[rol_actual] = []
        elif es_reactivo_numerado and rol_actual and rol_actual in roles and len(vals) >= 2:
            roles[rol_actual].append(vals[1])

wb.close()

roles = {k: v for k, v in roles.items() if v}

out = 'export const CONDUCTAS_INDIVIDUALES: string[] = ' + json.dumps(individuales, ensure_ascii=False, indent=2)
out += '\n\nexport const ROLES_VP: Record<string, string[]> = ' + json.dumps(roles, ensure_ascii=False, indent=2) + '\n'

with open('prisma/seed-data/competencias-vp.ts', 'w') as f:
    f.write(out)

print(f'{len(individuales)} conductas individuales, {len(roles)} roles')
for nombre, reactivos in roles.items():
    print(f'  - {nombre}: {len(reactivos)} reactivos')
