import { useMemo, useState } from "react";
import { capabilityLabels, screenFamilies } from "../contract";
import { backendTotal, compositeScore, concepts, experienceTotal } from "../concepts";
import { capabilityIds, type CapabilityFit, type ScreenFamilyId } from "../types";
import { ConceptPhone } from "./ConceptPhone";

const fitAbbreviation: Record<CapabilityFit, string> = {
  Reused: "R",
  Adapted: "A",
  "New UI only": "N",
  "Requires backend change": "B",
};

export function Scorecard() {
  return (
    <section className="scorecard-section" aria-labelledby="scorecard-title">
      <div className="section-heading">
        <span className="kicker">Evidence-based ranking</span>
        <h2 id="scorecard-title">Experience leads; feasibility keeps the recommendation honest.</h2>
        <p>Final score = 60% experience quality + 40% backend feasibility. The raw scores remain visible so a visually exciting concept cannot hide migration cost.</p>
      </div>
      <div className="scorecard-table-wrap">
        <table className="scorecard-table">
          <thead><tr><th>Rank</th><th>Direction</th><th>Experience</th><th>Backend</th><th>Composite</th></tr></thead>
          <tbody>
            {concepts.map((concept) => (
              <tr key={concept.id} className={concept.rank <= 3 ? "finalist" : ""}>
                <td><strong>{concept.rank}</strong></td>
                <td><span>{concept.name}</span>{concept.rank <= 3 && <small>Finalist</small>}</td>
                <td><div className="score-bar"><i style={{ width: `${experienceTotal(concept)}%` }} /><span>{experienceTotal(concept)}</span></div></td>
                <td><div className="score-bar backend"><i style={{ width: `${backendTotal(concept)}%` }} /><span>{backendTotal(concept)}</span></div></td>
                <td><strong>{compositeScore(concept).toFixed(1)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ConceptGallery() {
  const [selectedId, setSelectedId] = useState("dual-track");
  const [screen, setScreen] = useState<ScreenFamilyId>("workout");
  const selected = useMemo(() => concepts.find((concept) => concept.id === selectedId) ?? concepts[0], [selectedId]);
  const fitCounts = useMemo(() => capabilityIds.reduce<Record<CapabilityFit, number>>((counts, id) => {
    counts[selected.capabilityFit[id]] += 1;
    return counts;
  }, { Reused: 0, Adapted: 0, "New UI only": 0, "Requires backend change": 0 }), [selected]);

  return (
    <section className="concept-gallery-section" aria-labelledby="gallery-title">
      <div className="section-heading">
        <span className="kicker">15 structurally unique systems</span>
        <h2 id="gallery-title">Change the organizing idea—not merely the palette.</h2>
        <p>Choose a direction and move through the same eight synthetic screen families. Each phone uses a different navigation topology, content unit, workout model, planning model, and interaction grammar.</p>
      </div>

      <div className="concept-picker" role="group" aria-label="Design directions">
        {concepts.map((concept) => (
          <button type="button" key={concept.id} aria-pressed={selected.id === concept.id} onClick={() => setSelectedId(concept.id)}>
            <span>{concept.rank}</span><strong>{concept.name}</strong><small>{compositeScore(concept).toFixed(1)}</small>
          </button>
        ))}
      </div>

      <div className="concept-stage">
        <div className="concept-stage-copy">
          <div className="concept-rank-line"><span>Rank {selected.rank}</span><strong>{compositeScore(selected).toFixed(1)} composite</strong></div>
          <h3>{selected.name}</h3>
          <p className="concept-thesis">{selected.thesis}</p>
          <dl className="concept-dimensions">
            <div><dt>Navigation</dt><dd>{selected.dimensions.navigation}</dd></div>
            <div><dt>Workout</dt><dd>{selected.dimensions.workoutModel}</dd></div>
            <div><dt>Planning</dt><dd>{selected.dimensions.planningModel}</dd></div>
            <div><dt>Progress</dt><dd>{selected.dimensions.progressModel}</dd></div>
          </dl>
          <div className="concept-fit-summary">
            {(Object.entries(fitCounts) as Array<[CapabilityFit, number]>).map(([label, count]) => <span key={label}><b>{count}</b>{label}</span>)}
          </div>
          <div className="concept-notes"><div><strong>Why it works</strong><ul>{selected.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Risk</strong><ul>{selected.risks.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
        </div>

        <div className="concept-preview-column">
          <div className="screen-family-picker" role="tablist" aria-label="Screen families">
            {screenFamilies.map((family) => <button type="button" role="tab" aria-selected={screen === family.id} key={family.id} onClick={() => setScreen(family.id)}>{family.label}</button>)}
          </div>
          <ConceptPhone concept={selected} screen={screen} />
        </div>
      </div>

      <details className="capability-matrix">
        <summary>Capability fit for {selected.name}</summary>
        <div className="capability-grid">
          {capabilityIds.map((id) => <div key={id}><span>{fitAbbreviation[selected.capabilityFit[id]]}</span><strong>{capabilityLabels[id]}</strong><small>{selected.capabilityFit[id]}</small></div>)}
        </div>
      </details>
    </section>
  );
}

export function UniquenessAudit() {
  return (
    <section className="uniqueness-section" aria-labelledby="uniqueness-title">
      <div className="section-heading compact">
        <span className="kicker">Structural guardrail</span>
        <h2 id="uniqueness-title">Color does not earn uniqueness credit.</h2>
        <p>All 105 concept pairs are tested against seven structural dimensions. Every pair must differ in at least four.</p>
      </div>
      <div className="dimension-grid">
        {[
          ["01", "Organizing metaphor"], ["02", "Navigation topology"], ["03", "Primary content unit"], ["04", "Workout execution"], ["05", "Planning structure"], ["06", "Progress presentation"], ["07", "Interaction grammar"],
        ].map(([number, label]) => <div key={number}><span>{number}</span><strong>{label}</strong></div>)}
      </div>
    </section>
  );
}
