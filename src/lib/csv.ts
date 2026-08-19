export function parseLeadCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const parseLine = (line:string) => {
    const out:string[] = []
    let cur = '', quoted = false
    for (let i=0; i<line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i+1] === '"') { cur += '"'; i++ }
        else quoted = !quoted
      } else if (ch === ',' && !quoted) {
        out.push(cur.trim()); cur = ''
      } else cur += ch
    }
    out.push(cur.trim())
    return out
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,'_'))
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const row:any = {}
    headers.forEach((h,i) => row[h] = vals[i] ?? '')
    return {
      owner_name: row.owner_name || row.owner || row.seller || 'Unknown Owner',
      property_address: row.property_address || row.address || row.property || '',
      city: row.city || '',
      source: row.source || 'CSV Import',
      stage: 'New',
      score: Number(row.score || 70),
      arv: Number(row.arv || 0),
      asking: Number(row.asking || row.asking_price || 0),
      repairs: Number(row.repairs || row.repair_estimate || 0),
      last_touch: 'Never',
      next_action: 'First contact'
    }
  }).filter(r => r.property_address)
}
