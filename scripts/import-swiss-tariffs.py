"""Generate compact per-canton 2026 wage tariffs from the official ESTV ZIP.
The input is a public dataset, not executable code. No filesystem extraction.
"""
from pathlib import Path
import base64,collections,gzip,hashlib,json,re,zipfile
from urllib.request import Request,urlopen
root=Path(__file__).resolve().parents[1]
source=root/'docs/swiss/tariffs-2026-source.zip'
manifest=root/'docs/swiss/source.json'
metadata=json.loads(manifest.read_text())
if not source.exists():
 request=Request(metadata['source'],headers={
  'User-Agent':'Grenzgehalt/4.23 (https://github.com/cococheaf/grenzgehalt)',
  'Referer':'https://www.estv.admin.ch/de/quellensteuertarife-import-in-lohnbuchhaltungssysteme',
 })
 with urlopen(request,timeout=60) as response: data=response.read(25_000_001)
 if hashlib.sha256(data).hexdigest()!=metadata['sha256']: raise SystemExit('ESTV-Download weicht von der geprüften SHA256-Prüfsumme ab.')
 source.write_bytes(data)
if hashlib.sha256(source.read_bytes()).hexdigest()!=metadata['sha256']: raise SystemExit('Lokale ESTV-Datei weicht von der geprüften SHA256-Prüfsumme ab.')
metadata['cantons']={}
size=0
with zipfile.ZipFile(source) as z:
 for name in sorted(z.namelist()):
  assert re.fullmatch(r'tar26[a-z]{2}\.txt',name),name
  lines=z.read(name).decode('ascii').splitlines();canton=lines[0][2:4]
  tables=collections.defaultdict(list);previous={};raw_count=0
  for line in lines[1:]:
   if line[:2]!='06':continue
   code=line[6:16].strip()
   if not re.fullmatch('[ABCH][0-9][NY]',code):continue
   assert line[2:4]=='01' and line[4:6]==canton and line[16:24]=='20260101',line
   start=int(line[24:33]);step=int(line[33:42]);minimum=int(line[45:54]);rate=int(line[54:59]);raw_count+=1
   assert rate<=10000 and step>0
   if code in previous:assert start>previous[code][0],(canton,code,start)
   else:assert start in [0,100],(canton,code,start)
   previous[code]=(start,start+step)
   row=[start,rate,minimum]
   if not tables[code] or tables[code][-1][1:]!=row[1:]:tables[code].append(row)
  assert 'A0N' in tables or 'A0Y' in tables,canton
  maximum={code:end for code,(start,end) in previous.items()}
  assert all(end>=10000000 for end in maximum.values()),canton
  data={'canton':canton,'created':lines[0][19:27],'year':2026,'max':maximum,'tables':tables}
  packed=base64.b64encode(gzip.compress(json.dumps(data,separators=(',',':')).encode(),mtime=0)).decode()
  text='// Gzip + base64; generated from official ESTV wage tariffs. See docs/swiss/source.json.\nexport default '+json.dumps(packed)+';\n'
  out=root/'dist/assets'/('ch-tariffs-'+canton.lower()+'.mjs');out.write_text(text);size+=out.stat().st_size
  metadata['cantons'][canton]={'source_records':raw_count,'tariffs':len(tables),'compressed_rows':sum(len(t) for t in tables.values()),'created':data['created'],'bytes':out.stat().st_size}
manifest.write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps({'cantons':len(metadata['cantons']),'bytes_total':size,'largest':sorted(metadata['cantons'].items(),key=lambda a:a[1]['bytes'],reverse=True)[:3]}))
