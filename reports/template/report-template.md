# Market Recap — {{date}}

## Executive Summary
{{#each executive_summary}}
- {{this}}
{{/each}}

## Current Regime
- {{current_regime}}

## 1) Market State
```json
{{json sections.market_state}}
```

## 2) Sector Rotation
```json
{{json sections.sector_rotation}}
```

## 3) Flow & Positioning
```json
{{json sections.flow_positioning}}
```

## 4) Macro Drivers
```json
{{json sections.macro_drivers}}
```

## 5) Signal & Factor
```json
{{json sections.signal_factor}}
```

## Analyst Views
{{#each analyst_views}}
### {{analyst}} ({{focus}})
**Highlights**
{{#each highlights}}
- {{this}}
{{/each}}

**Risks**
{{#each risks}}
- {{this}}
{{/each}}

**Actions**
{{#each actions}}
- {{this}}
{{/each}}
{{/each}}

## Next Actions
{{#each next_actions}}
- {{this}}
{{/each}}
