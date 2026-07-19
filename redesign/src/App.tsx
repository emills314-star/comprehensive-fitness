import { useState } from "react";
import { concepts } from "./concepts";
import { ConceptGallery, Scorecard, UniquenessAudit } from "./components/ConceptGallery";
import { DualTrackPrototype } from "./components/DualTrackPrototype";
import "./styles.css";

type Section = "scorecard" | "concepts" | "winner" | "boundary";

export default function App() {
  const [section, setSection] = useState<Section>("scorecard");
  const winner = concepts[0];

  return (
    <div className="redesign-app">
      <a className="skip-link" href="#redesign-main">Skip to redesign content</a>
      <header className="redesign-header">
        <div><span>COMPREHENSIVE FITNESS</span><strong>UI Reinvention Lab</strong></div>
        <nav aria-label="Redesign sections">
          {(["scorecard", "concepts", "winner", "boundary"] as Section[]).map((item) => <button type="button" key={item} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item}</button>)}
        </nav>
      </header>

      <main id="redesign-main" tabIndex={-1}>
        <section className="redesign-hero">
          <span className="kicker">Blank-slate mobile systems · synthetic data only</span>
          <h1>Fifteen different answers to the same training problem.</h1>
          <p>The current product supplies behavior, safety rules, and data contracts—nothing visual. These directions deliberately change the app’s organizing metaphor, navigation, interaction unit, workout execution, planning structure, and progress language.</p>
          <div className="hero-metrics"><div><strong>15</strong><span>design systems</span></div><div><strong>8</strong><span>screen families each</span></div><div><strong>105</strong><span>pairwise uniqueness checks</span></div><div><strong>{winner.name}</strong><span>recommended winner</span></div></div>
        </section>

        {section === "scorecard" && <><Scorecard /><UniquenessAudit /></>}
        {section === "concepts" && <ConceptGallery />}
        {section === "winner" && <DualTrackPrototype />}
        {section === "boundary" && (
          <section className="boundary-section" aria-labelledby="boundary-title">
            <div className="section-heading"><span className="kicker">Typed migration boundary</span><h2 id="boundary-title">Replace presentation without rewriting trusted behavior.</h2><p>The target React shell consumes stable read models and emits commands. Existing engines, persistence, APIs, backups, sync consent, and historical snapshots remain authoritative.</p></div>
            <div className="boundary-flow" aria-label="Legacy domain and effects connect through a typed adapter to the React user interface">
              <div><span>Existing core</span><strong>Engines · IndexedDB · APIs</strong><small>Behavior source of truth</small></div><i>→</i><div className="active"><span>Typed adapter</span><strong>Read models · Commands · Effects</strong><small>Compatibility boundary</small></div><i>→</i><div><span>New shell</span><strong>React · Components · Routes</strong><small>Presentation source of truth</small></div>
            </div>
            <div className="boundary-principles"><article><strong>One active workout</strong><p>Start and resume commands preserve the canonical session lock.</p></article><article><strong>Explicit submission</strong><p>The UI cannot turn drafts into history without confirmation.</p></article><article><strong>Readiness changes today</strong><p>No visual system may rewrite the base plan.</p></article><article><strong>Local-first ownership</strong><p>Imports, exports, consent, and conflict recovery retain their trust boundaries.</p></article></div>
          </section>
        )}
      </main>
    </div>
  );
}
