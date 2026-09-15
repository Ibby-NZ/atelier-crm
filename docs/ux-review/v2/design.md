# Page-based CRM iteration

User direction, 15 September 2026: a visibly stronger UI/UX iteration, with sales orders, purchase orders and related workflows presented as separate pages instead of large tab navigation. This authorises the navigation restructure. The API, record rules and design language remain fixed.

Design: retain every working URL and promote its screen to grouped side navigation. Sales orders, Purchase orders and Supplier invoices are permanently visible individual links. Catalogue, stock, samples, pricing, clients and reporting expose their existing pages in the sidebar. Active context is resolved precisely on create, detail and historical routes. Historical and demo links are labelled and remain reachable. No route is renamed or data source merged.

The shared SectionTabs component stops drawing horizontal navigation. Its existing section create actions move into the page header through a workspace context; they remain available on every page in their original section. PageHeader becomes more compact only inside the operations shell; the brand-world header is unchanged. Main content receives more width from smaller existing spacing values. The sidebar scrolls independently and the existing phone navigation remains keyboard accessible.

Dashboard: separate KPI cards and properly framed recent-order/inbound panels, preserving all API quantities, financial masking, links, labels and indicative status. No new computed KPI or demo value.

Sales orders: clearly grouped existing filters and a readable list/editor hierarchy, with existing URL apply rules and source-page count notes. Purchase orders: the list is the primary work area; backorder generation remains available in a compact collapsed panel above it instead of dominating the first view. The summary stays discoverable on long lists and preserves the existing empty-state instruction to plan above. Supplier invoices: compact existing filters, prominent document identity, clearer money/status alignment. All existing workflows and bodies remain unchanged.

Success: direct page links, no horizontal section tabs, existing create actions reachable, exactly one current nav destination for each live/detail/mirror route, improved first-viewport data visibility, green pure tests/build, and reviewed before/after images at1440 and1024. Existing API fixture browser tests remain separate from Vitest.

Excluded: API work, new statistics, new features or dependencies, new editor routes/drawers, demo-screen redesign, finance/access changes. Header demo search is retained pending the separate prior decision. This iteration does not infer approval to replace it with a live search.
