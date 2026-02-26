import fs from 'node:fs';
import path from 'node:path';
import YAML from 'js-yaml';
import Handlebars from 'handlebars';

Handlebars.registerHelper('json', (value) => JSON.stringify(value, null, 2));
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function readText(p) { return fs.readFileSync(p, 'utf8'); }
function readJson(p) { return JSON.parse(readText(p)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function findAnalystConfig(name) {
  const dir = path.join(ROOT, 'configs', 'analysts');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const exact = files.find(f => path.parse(f).name === name);
  if (exact) return path.join(dir, exact);
  if (name === 'default') {
    const d = files.find(f => path.parse(f).name === 'default');
    if (d) return path.join(dir, d);
  }
  throw new Error(`Analyst profile not found: ${name}. Available: ${files.join(', ')}`);
}

function loadModules() {
  const dir = path.join(ROOT, 'configs', 'modules');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  const modules = {};
  for (const file of files) {
    const doc = YAML.load(readText(path.join(dir, file)));
    modules[doc.module] = {
      objective: doc.objective,
      criteria: doc.criteria || [],
      sources: doc.sources || [],
      note: 'TODO: attach computed metrics/data evidence here'
    };
  }
  return modules;
}

function main() {
  const args = parseArgs(process.argv);
  const date = args.date || new Date().toISOString().slice(0, 10);
  const analystName = args.analyst || 'default';
  const regime = args.regime || 'Mixed';
  const project = 'Stock Market Recap (Multi-dimension)';

  const analystPath = findAnalystConfig(analystName);
  const analyst = YAML.load(readText(analystPath));
  const modules = loadModules();

  const report = {
    date,
    project,
    current_regime: regime,
    executive_summary: [
      'Global equities showed mixed performance with elevated dispersion across sectors.',
      'Rates and FX moved in a way that suggests macro uncertainty remains a key market driver.',
      'Flow/positioning signals indicate selective risk-taking rather than broad conviction.'
    ],
    sections: {
      market_state: modules['market-state'] || {},
      sector_rotation: modules['sector-rotation'] || {},
      flow_positioning: modules['flow-positioning'] || {},
      macro_drivers: modules['macro-drivers'] || {},
      signal_factor: modules['signal-factor'] || {}
    },
    analyst_views: [
      {
        analyst: analyst.name,
        focus: `${analyst.focus?.style || 'balanced'} | ${analyst.focus?.horizon || 'daily'}`,
        highlights: [
          'Key focus metrics loaded from analyst profile.',
          `Coverage: ${(analyst.coverage?.assets || []).join(', ')}`
        ],
        risks: [
          'Macro-event sensitivity may dominate single-factor signals.',
          'Concentration risk can mask weak market breadth.'
        ],
        actions: [
          'Review priority watchlist names and confirm signal alignment.',
          'Update evidence links for each high-confidence claim.'
        ]
      }
    ],
    next_actions: [
      'Ingest today\'s finalized data snapshot.',
      'Populate module outputs with measured metrics and charts.',
      'Review and approve analyst-specific action list before email distribution.'
    ],
    top_risks: [
      'Rates volatility spike',
      'Liquidity deterioration in crowded segments',
      'Policy/event surprise'
    ]
  };

  const schema = readJson(path.join(ROOT, 'reports', 'template', 'report.schema.json'));
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(report);
  if (!ok) {
    console.error('Schema validation failed:', validate.errors);
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'reports', date);
  ensureDir(outDir);

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  const mdTpl = Handlebars.compile(readText(path.join(ROOT, 'reports', 'template', 'report-template.md')), { noEscape: true });
  fs.writeFileSync(path.join(outDir, 'report.md'), mdTpl(report));

  const emailTpl = Handlebars.compile(readText(path.join(ROOT, 'reports', 'template', 'email-template.html')), { noEscape: true });
  fs.writeFileSync(path.join(outDir, 'email.html'), emailTpl(report));

  console.log(`Generated:\n- ${path.join('reports', date, 'report.json')}\n- ${path.join('reports', date, 'report.md')}\n- ${path.join('reports', date, 'email.html')}`);
}

main();
