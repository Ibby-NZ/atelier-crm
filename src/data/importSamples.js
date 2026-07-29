// The Colefax & Fowler price-list template (received 9 Jul), expanded 15 Jul with the technical
// product fields the team named (Repeat / Vertical Repeat / Pattern Match). This column set drives
// the import engine's auto-mapping. The DEFINITIVE full field list is still owed from Charlotte.
export const IMPORT_COLUMNS = [
  'Date Effective', 'Product Range', 'Code', 'Description', 'Item Type', 'Pack Type',
  'Contents', 'Width', 'Repeat', 'Vertical Repeat', 'Duty Rate', 'Wholesale Rate',
  'Currency', 'Freight Rate', 'Pattern Match',
]

// Baked-in sample mirroring the real sheet: GBP, Duty Rate mostly blank with some 'A' codes
// (the broker mapping — A10 — is still owed), one quoted-comma description, one non-numeric
// wholesale (POA), one blank currency and one unknown currency, so validation is demoable.
// Expected outcome: 7 stageable · 2 errors (POA, AUD) · duty/currency warnings on 5 rows.
export const colefaxSampleCSV = `Date Effective,Product Range,Code,Description,Item Type,Pack Type,Contents,Width,Repeat,Vertical Repeat,Duty Rate,Wholesale Rate,Currency,Freight Rate,Pattern Match
01/08/2026,Jardine Florals,W7004-01,"Jardine, Aqua on Ivory",Wallpaper,Roll,10.05m,52cm,64cm,64cm,,39.00,GBP,8,Straight
01/08/2026,Jardine Florals,W7004-02,"Jardine, Leaf Green",Wallpaper,Roll,10.05m,52cm,64cm,64cm,,39.00,GBP,8,Straight
01/08/2026,Baptista Wallpapers,W7011-04,Verity Stripe — Old Rose,Wallpaper,Roll,10.05m,52cm,26cm,26cm,A,42.50,GBP,8,Straight
01/08/2026,Lindon Wovens,F4855-03,Lindon Chenille — Sage,Fabric,Metre,,140cm,,,A,68.00,GBP,8,
01/08/2026,Lindon Wovens,F4855-07,Lindon Chenille — Denim,Fabric,Metre,,140cm,,,,68.00,GBP,8,
01/08/2026,Swedish Tree,F3506-02,"Swedish Tree, Rose",Fabric,Metre,,140cm,91cm,91cm,,84.00,GBP,8,Half drop
01/08/2026,Ashbury Velvets,F4901-01,Ashbury Velvet — Ochre,Fabric,Metre,,137cm,,,,POA,GBP,8,
01/08/2026,Ashbury Velvets,F4901-05,Ashbury Velvet — Indigo,Fabric,Metre,,137cm,,,,92.00,,8,
01/08/2026,Ashbury Velvets,F4901-09,Ashbury Velvet — Forest,Fabric,Metre,,137cm,,,,92.00,AUD,8,`
