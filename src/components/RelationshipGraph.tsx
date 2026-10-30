import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult } from "@contracts/analysis";

type Props = { entities: AnalysisResult["entities"]; relations: AnalysisResult["relations"] };

const W = 760;
const H = 410;
const NODE_W = 128;
const NODE_H = 50;

type Pos = { x: number; y: number };

// 初始排布：一圈椭圆，隔一个收缩一次半径。
// 只排在正圆上时，节点一多（十几个）上下两段就会互相压住，交错半径能立刻缓解；
// 剩下的交给拖动 —— 用户比任何自动布局都清楚自己想怎么看。
function initialLayout(count: number): Pos[] {
  const cx = W / 2;
  const cy = H / 2;
  const rx = 252;
  const ry = 138;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(count, 1)) * Math.PI * 2;
    const shrink = count > 6 && index % 2 === 1 ? 0.66 : 1;
    return {
      x: cx + Math.cos(angle) * rx * shrink,
      y: cy + Math.sin(angle) * ry * shrink,
    };
  });
}

function clamp({ x, y }: Pos): Pos {
  return {
    x: Math.min(W - NODE_W / 2 - 6, Math.max(NODE_W / 2 + 6, x)),
    y: Math.min(H - NODE_H / 2 - 6, Math.max(NODE_H / 2 + 6, y)),
  };
}

export default function RelationshipGraph({ entities, relations }: Props) {
  const [selectedId, setSelectedId] = useState(entities[0]?.id ?? "");
  const [moved, setMoved] = useState<Record<string, Pos>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const base = useMemo(() => initialLayout(entities.length), [entities]);

  // 换了论文就回到初始布局，否则上一份的坐标会套到新的实体上
  useEffect(() => {
    setMoved({});
    setSelectedId(entities[0]?.id ?? "");
  }, [entities]);

  const nodes = entities.map((entity, index) => ({
    ...entity,
    ...(moved[entity.id] ?? base[index] ?? { x: W / 2, y: H / 2 }),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validRelations = relations.filter((relation) => byId.has(relation.source) && byId.has(relation.target));

  // 屏幕坐标 → SVG 坐标：用 getScreenCTM 反算，容器被缩放或滚动过也不会错位
  const toSvg = (clientX: number, clientY: number): Pos => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  };

  const startDrag = (event: React.PointerEvent<SVGGElement>, id: string) => {
    const current = byId.get(id);
    if (!current) return;
    const point = toSvg(event.clientX, event.clientY);
    dragRef.current = { id, dx: current.x - point.x, dy: current.y - point.y };
    setDraggingId(id);
    setSelectedId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toSvg(event.clientX, event.clientY);
    setMoved((prev) => ({ ...prev, [drag.id]: clamp({ x: point.x + drag.dx, y: point.y + drag.dy }) }));
  };

  const endDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!entities.length) {
    return <div className="empty-state">这篇文字中没有提取到明确主体。可以补充研究对象、变量或制度参与方后重新解析。</div>;
  }

  return (
    <div className="relation-wrap">
      <div className="graph-toolbar">
        <span className="graph-hint">拖动卡片可重新摆放位置；点击卡片查看它在论文里的角色。</span>
        <button className="text-button" onClick={() => setMoved({})} disabled={!Object.keys(moved).length}>
          重置布局
        </button>
      </div>
      <div className="graph-scroll" aria-label="论文主体关系图">
        <svg
          ref={svgRef}
          className="relation-graph"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="可拖动的主体关系网络图"
        >
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
              <g key={`${relation.source}-${relation.target}-${index}`} pointerEvents="none">
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="relation-edge" markerEnd="url(#relation-arrow)" />
                <text x={mx} y={my - 5} textAnchor="middle" className="relation-label">{relation.label}</text>
              </g>
            );
          })}
          {nodes.map((node) => (
            <g
              key={node.id}
              className={`relation-node ${selectedId === node.id ? "selected" : ""} ${draggingId === node.id ? "dragging" : ""}`}
              transform={`translate(${node.x}, ${node.y})`}
              role="button"
              tabIndex={0}
              aria-label={`查看主体：${node.name}`}
              onPointerDown={(event) => startDrag(event, node.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(node.id);
                }
              }}
            >
              <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx="7" />
              <text textAnchor="middle" y="-2" className="node-name">{node.name.length > 10 ? `${node.name.slice(0, 10)}…` : node.name}</text>
              <text textAnchor="middle" y="15" className="node-type">{node.type}</text>
            </g>
          ))}
        </svg>
      </div>
      {selectedId && byId.get(selectedId) && (
        <div className="entity-detail" aria-live="polite">
          <div>
            <span className="eyebrow">{byId.get(selectedId)!.type}</span>
            <h3>{byId.get(selectedId)!.name}</h3>
            <p>{byId.get(selectedId)!.description}</p>
          </div>
          <ul>
            {validRelations.filter((relation) => relation.source === selectedId || relation.target === selectedId).slice(0, 4).map((relation, index) => (
              <li key={`${relation.source}-${relation.target}-${index}`}>
                <b>{byId.get(relation.source)?.name}</b><span>{relation.label}</span><b>{byId.get(relation.target)?.name}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
