// The universal price-list template, v3 — the client's own correction (12 Aug) of the v2 they were
// sent: Product Range renamed Brand (it has always held the house, so v2's separate Brand column
// was a duplicate), Pack Type renamed Unit, Repeat renamed Horizontal Repeat, and Pattern Match
// moved up beside the repeats. Kept in step with scripts/lib/price-template.js in atelier-api,
// which is where the converter matches a drop's header row.
export const IMPORT_COLUMNS = [
  'Date Effective', 'Brand', 'Code', 'Description', 'Item Type', 'Unit',
  'Contents', 'Width', 'Horizontal Repeat', 'Vertical Repeat', 'Pattern Match',
  'Duty Rate', 'Wholesale Rate', 'Currency', 'Freight Rate',
]

// The labels these columns used to carry. The wizard reads a header the office DROPS on it, and
// every sheet sent before today still says "Pack Type" — refusing to map those would turn a
// renamed label into a re-typed spreadsheet. Aliases only ever ADD a header a column answers to.
export const COLUMN_ALIASES = Object.freeze({
  Brand: ['Product Range'],
  Unit: ['Pack Type'],
  'Horizontal Repeat': ['Repeat'],
})

// Baked-in sample mirroring the real sheet: GBP, Duty Rate mostly blank with some 'A' codes
// (the broker mapping — A10 — is still owed), one quoted-comma description, one non-numeric
// wholesale (POA), one blank currency and one unknown currency, so validation is demoable.
// Expected outcome: 7 stageable · 2 errors (POA, AUD) · duty/currency warnings on 5 rows.
export const colefaxSampleCSV = `Date Effective,Brand,Code,Description,Item Type,Unit,Contents,Width,Horizontal Repeat,Vertical Repeat,Pattern Match,Duty Rate,Wholesale Rate,Currency,Freight Rate
01/08/2026,Colefax & Fowler,W7004-01,"Jardine, Aqua on Ivory",Wallpaper,Roll,10.05m,52cm,64cm,64cm,Straight,,39.00,GBP,8
01/08/2026,Colefax & Fowler,W7004-02,"Jardine, Leaf Green",Wallpaper,Roll,10.05m,52cm,64cm,64cm,Straight,,39.00,GBP,8
01/08/2026,Colefax & Fowler,W7011-04,Verity Stripe — Old Rose,Wallpaper,Roll,10.05m,52cm,26cm,26cm,Straight,A,42.50,GBP,8
01/08/2026,Colefax & Fowler,F4855-03,Lindon Chenille — Sage,Fabric,Metre,,140cm,,,,A,68.00,GBP,8
01/08/2026,Colefax & Fowler,F4855-07,Lindon Chenille — Denim,Fabric,Metre,,140cm,,,,,68.00,GBP,8
01/08/2026,Colefax & Fowler,F3506-02,"Swedish Tree, Rose",Fabric,Metre,,140cm,91cm,91cm,Half drop,,84.00,GBP,8
01/08/2026,Colefax & Fowler,F4901-01,Ashbury Velvet — Ochre,Fabric,Metre,,137cm,,,,,POA,GBP,8
01/08/2026,Colefax & Fowler,F4901-05,Ashbury Velvet — Indigo,Fabric,Metre,,137cm,,,,,92.00,,8
01/08/2026,Colefax & Fowler,F4901-09,Ashbury Velvet — Forest,Fabric,Metre,,137cm,,,,,92.00,AUD,8`
