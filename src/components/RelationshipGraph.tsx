import { useMemo, useState } from "react";
import type { AnalysisResult } from "@contracts/analysis";

type Props = { entities: AnalysisResult["entities"]; relations: AnalysisResult["relations"] };

export default function RelationshipGraph({ entities, relations }: Props) {
  const [selectedId, setSelectedId] = useState(entities[0]?.id ?? "");
  const selected = entities.find((entity) => entity.id === selectedId) ?? entities[0];
  const nodes = useMemo(() => entities.map((entity, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(entities.length, 1)) * Math.PI * 2;
    return { ...entity, x: 380 + Math.cos(angle) * 270, y: 202 + Math.sin(angle) * 142 };
  }), [entities]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validRelations = relations.filter((relation) => byId.has(relation.source) && byId.has(relation.target));

  if (!entities.length) {
    return <div className="empty-state">这篇文字中没有提取到明确主体。可以补充研究对象、变量或制度参与方后重新解析。</div>;
  }

  return (
    <div className="relation-wrap">
      <div className="graph-scroll" aria-label="论文主体关系图">
        <svg className="relation-graph" viewBox="0 0 760 410" role="img" aria-label="主体关系网络，节点可点击">
          <defs>
            <marker id="relation-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--faint)" />
            </marker>
          </defs>
          {validRelations.map((relation, index) => {
            const source = byId.get(relation.source)!;
            const target = byId.get(relation.target)!;
            const mx = (source.x + target.x) / 2;
            const my = (source.y + target.y) / 2;
            return (
              <g key={`${relation.source}-${relation.target}-${index}`}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="relation-edge" markerEnd="url(#relation-arrow)" />
                <text x={mx} y={my - 5} textAnchor="middle" className="relation-label">{relation.label}</text>
              </g>
            );
          })}
          {nodes.map((node) => (
            <g
              key={node.id}
              className={`relation-node ${selected?.id === node.id ? "selected" : ""}`}
              transform={`translate(${node.x}, ${node.y})`}
              role="button"
              tabIndex={0}
              aria-label={`查看主体：${node.name}`}
              onClick={() => setSelectedId(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(node.id);
                }
              }}
            >
              <rect x="-64" y="-25" width="128" height="50" rx="7" />
              <text textAnchor="middle" y="-2" className="node-name">{node.name.length > 10 ? `${node.name.slice(0, 10)}…` : node.name}</text>
              <text textAnchor="middle" y="15" className="node-type">{node.type}</text>
            </g>
          ))}
        </svg>
      </div>
      {selected && (
        <div className="entity-detail" aria-live="polite">
          <div>
            <span className="eyebrow">{selected.type}</span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
          </div>
          <ul>
            {validRelations.filter((relation) => relation.source === selected.id || relation.target === selected.id).slice(0, 4).map((relation, index) => (
              <li key={index}>
                <b>{byId.get(relation.source)?.name}</b><span>{relation.label}</span><b>{byId.get(relation.target)?.name}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
