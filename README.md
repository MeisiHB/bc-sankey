bc-sankey
Interactive Sankey P&L diagram for Microsoft Business Central
A browser-based Sankey diagram that visualizes Profit & Loss data — showing how revenue flows through cost groups down to the operating result. Built to match the Microsoft Dynamics 365 / Business Central design language.
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Status: Phase 1](https://img.shields.io/badge/Status-Phase%201%20(Static)-green.svg)
---
Features (current — Phase 1)
Interactive Sankey diagram with up to 3 hierarchy levels on each side
Revenue side: Sub-sub-groups → Sub-groups → Total revenue
Cost side: Total revenue → Cost groups → Sub-groups → Sub-sub-groups
Microsoft Business Central color scheme and Segoe UI typography
Load data from JSON file or manual entry
Fully browser-based — no server, no installation
Roadmap
Phase	Description	Status
1	Static Sankey, browser-based, sample data	✅ Current
2	Time series animation (month/year playback)	Planned
3	Business Central Cloud API connection	Planned
4	AL Control Add-in for BC client	Planned
Usage
Download or clone this repository
Open `index.html` in your browser
Load your own data via the JSON upload or edit `data/sample.json`
No build step required. No dependencies to install.
Data Format
```json
{
  "title": "P&L 2024",
  "currency": "EUR",
  "nodes": [
    { "id": "domestic", "label": "Inland", "group": "revenue-2" },
    { "id": "export",   "label": "Export",  "group": "revenue-2" }
  ],
  "links": [
    { "source": "domestic", "target": "product-revenue", "value": 420000 }
  ]
}
```
Design
Follows the official Business Central Control Add-in Style Guide:
Primary color: `#00B7C3`
Font: Segoe UI
Chart palette from Microsoft Dynamics 365 specification
License
MIT License — free to use, modify, and distribute.  
See LICENSE for details.
Contributing
Contributions welcome. Please open an issue first to discuss what you'd like to change.
