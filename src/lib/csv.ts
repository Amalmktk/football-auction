import Papa from 'papaparse'

export interface PlayerImportRow {
  name: string
  base_price: number
  photo_url: string | null
}

export interface ParsedImport {
  rows: PlayerImportRow[]
  errors: string[]
}

export const DEFAULT_BASE_PRICE = 20

export const CSV_TEMPLATE =
  'name,base_price,photo_url\n' + 'Arjun Nair,100,\n' + 'Meera Pillai,50,\n'

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v != null && v.trim() !== '') return v.trim()
  }
  return ''
}

/** Parse a players CSV. Header names are matched loosely (case, spaces, common aliases); extra columns are ignored. */
export function parsePlayersCsv(file: File): Promise<ParsedImport> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
      error: reject,
      complete: (result) => {
        const rows: PlayerImportRow[] = []
        const errors: string[] = []
        result.data.forEach((raw, i) => {
          const line = i + 2 // header is line 1
          const name = pick(raw, 'name', 'player', 'player_name')
          if (!name) {
            errors.push(`Line ${line}: missing name`)
            return
          }

          const priceRaw = pick(raw, 'base_price', 'baseprice', 'price', 'base')
          const base_price = priceRaw ? Number(priceRaw) : DEFAULT_BASE_PRICE
          if (!Number.isInteger(base_price) || base_price <= 0) {
            errors.push(`Line ${line} (${name}): base price must be a positive whole number`)
            return
          }

          rows.push({
            name,
            base_price,
            photo_url: pick(raw, 'photo_url', 'photo', 'image', 'image_url') || null,
          })
        })
        resolve({ rows, errors })
      },
    })
  })
}
