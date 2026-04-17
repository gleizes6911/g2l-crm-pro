import React, { useState, useEffect } from "react";
import API_BASE from '../../config/api';
const USE_MOCK = false;

const MOCK_EMPLOYEES = [
  { Id: "1",  Name: "Jean-Pierre Martin", Title: "DG D&J",        Department: "Direction",    ManagerId: null },
  { Id: "2",  Name: "Karim Mansouri",     Title: "DG TPS",        Department: "Direction",    ManagerId: null },
  { Id: "3",  Name: "Guillaume Dupont",   Title: "DAF",           Department: "Finance",      ManagerId: "1" },
  { Id: "4",  Name: "Sophie Leroy",       Title: "DRH",           Department: "RH",           ManagerId: "1" },
  { Id: "5",  Name: "Marc Petit",         Title: "Dir. Exploit.", Department: "Exploitation", ManagerId: "1" },
  { Id: "6",  Name: "Céline Moreau",      Title: "Comptable",     Department: "Finance",      ManagerId: "3" },
  { Id: "7",  Name: "Théo Bernard",       Title: "Contrôleur",    Department: "Finance",      ManagerId: "3" },
  { Id: "8",  Name: "Isabelle Roux",      Title: "Chargée RH",    Department: "RH",           ManagerId: "4" },
  { Id: "9",  Name: "Antoine Blanc",      Title: "Chef Parc D&J", Department: "Exploitation", ManagerId: "5" },
  { Id: "10", Name: "Nadia Saïd",         Title: "Chef Parc TPS", Department: "Exploitation", ManagerId: "2" },
  { Id: "11", Name: "Kevin Lambert",      Title: "Chauffeur SPL", Department: "Exploitation", ManagerId: "9" },
  { Id: "12", Name: "Rachid Ouali",       Title: "Chauffeur SPL", Department: "Exploitation", ManagerId: "9" },
  { Id: "13", Name: "Fatima Benali",      Title: "Chauffeur PL",  Department: "Exploitation", ManagerId: "10" },
];

function buildHierarchyTree(employees) {
  const map = {};
  employees.forEach(e => { map[e.Id] = { ...e, children: [] }; });
  const roots = [];
  employees.forEach(e => {
    if (e.ManagerId && map[e.ManagerId]) {
      map[e.ManagerId].children.push(map[e.Id]);
    } else if (e.ManagerId && !map[e.ManagerId]) {
      roots.push(map[e.Id]);
    } else {
      if (
        e.Department === "Direction" ||
        e.Department === "direction" ||
        !e.Department ||
        (e.Title || "").toLowerCase().includes("directeur") ||
        (e.Title || "").toLowerCase().includes("gérant") ||
        (e.Title || "").toLowerCase().includes("président")
      ) {
        roots.push(map[e.Id]);
      }
    }
  });
  return roots;
}

function buildStructuralTree(employees) {
  const depts = {};
  employees.forEach(e => {
    const dept = e.Department || "Non classé";
    if (!depts[dept]) depts[dept] = [];
    depts[dept].push(e);
  });
  return Object.entries(depts).map(([dept, members]) => ({
    id: `dept_${dept}`, name: dept, children: members, count: members.length,
  }));
}

function initials(name) {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function Avatar({ name, size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#e8f0fe", color: "#1a73e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.33, fontWeight: 600, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

function OrgNode({ node, depth = 0, onSelect, selectedId }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.Id;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        onClick={() => onSelect(node)}
        style={{ background: isSelected ? "#e8f0fe" : "#fff", border: `1px solid ${isSelected ? "#1a73e8" : "#e0e0e0"}`, borderRadius: 8, padding: "12px 16px", minWidth: 180, maxWidth: 220, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", position: "relative", zIndex: 1 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={node.Name} />
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.Name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{node.Title}</div>
          </div>
        </div>
        {node.Department && (
          <div style={{ marginTop: 8, fontSize: 10, background: "#f5f5f5", color: "#555", borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>{node.Department}</div>
        )}
        {hasChildren && (
          <div style={{ marginTop: 4, fontSize: 10, color: "#aaa" }}>{node.children.length} subordonné{node.children.length > 1 ? "s" : ""}</div>
        )}
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", width: 20, height: 20, borderRadius: "50%", background: "#fff", border: "1px solid #ddd", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
          >
            {expanded ? "−" : "+"}
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div style={{ width: 2, height: 28, background: "#ddd" }} />
      )}

      {hasChildren && expanded && (
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 24, position: "relative" }}>
          {node.children.length > 1 && (
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", height: 2, width: "calc(100% - 110px)", background: "#ddd" }} />
          )}
          {node.children.map(child => (
            <div key={child.Id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 2, height: 28, background: "#ddd" }} />
              <OrgNode node={child} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HierarchyView({ employees, onSelect, selectedId }) {
  const roots = buildHierarchyTree(employees);
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 64, overflowX: "auto", padding: 32, minWidth: "fit-content" }}>
      {roots.map(root => (
        <OrgNode key={root.Id} node={root} depth={0} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
}

function DeptBlock({ dept, onSelect, selectedId }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 20px", background: "#f8f9fa", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{dept.name}</span>
          <span style={{ fontSize: 12, background: "#e8f0fe", color: "#1a73e8", borderRadius: 20, padding: "2px 10px" }}>{dept.count} pers.</span>
        </div>
        <span>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 16 }}>
          {dept.children.map(emp => (
            <div key={emp.Id} onClick={() => onSelect(emp)} style={{ display: "flex", alignItems: "center", gap: 8, background: selectedId === emp.Id ? "#e8f0fe" : "#fff", border: `1px solid ${selectedId === emp.Id ? "#1a73e8" : "#e0e0e0"}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", minWidth: 180 }}>
              <Avatar name={emp.Name} size={30} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.Name}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{emp.Title}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StructuralView({ employees, onSelect, selectedId }) {
  const depts = buildStructuralTree(employees);
  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {depts.map(dept => (
        <DeptBlock key={dept.id} dept={dept} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
}

function DetailPanel({ employee, allEmployees, onClose }) {
  if (!employee) return null;
  const manager = allEmployees.find(e => e.Id === employee.ManagerId);
  const subordinates = allEmployees.filter(e => e.ManagerId === employee.Id);
  return (
    <div style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 300, background: "#fff", borderLeft: "1px solid #e0e0e0", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", zIndex: 100, overflowY: "auto" }}>
      <div style={{ padding: 20 }}>
        <button onClick={onClose} style={{ float: "right", background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
        <Avatar name={employee.Name} size={56} />
        <h3 style={{ marginTop: 12, marginBottom: 4 }}>{employee.Name}</h3>
        <p style={{ color: "#666", fontSize: 13, margin: 0 }}>{employee.Title}</p>
        <p style={{ color: "#999", fontSize: 12, marginTop: 4 }}>{employee.Department}</p>
        {employee.Email && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>Email</div>
            <a href={`mailto:${employee.Email}`} style={{ fontSize: 13, color: "#1a73e8" }}>{employee.Email}</a>
          </div>
        )}
        {manager && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", marginBottom: 8 }}>Responsable N+1</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8f9fa", borderRadius: 8, padding: "8px 10px" }}>
              <Avatar name={manager.Name} size={28} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{manager.Name}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{manager.Title}</div>
              </div>
            </div>
          </div>
        )}
        {subordinates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", marginBottom: 8 }}>Subordonnés directs ({subordinates.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {subordinates.map(sub => (
                <div key={sub.Id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8f9fa", borderRadius: 8, padding: "7px 10px" }}>
                  <Avatar name={sub.Name} size={26} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{sub.Name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{sub.Title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrganigrammeRH() {
  const [tab, setTab] = useState("hierarchical");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (USE_MOCK) {
          await new Promise(r => setTimeout(r, 300));
          setEmployees(MOCK_EMPLOYEES);
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/api/employes`);
        if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
        const data = await res.json();

        const sfEmployees = (data.employes || []).map(e => ({
          Id: e.id,
          Name: e.nomComplet,
          Title: e.fonction || "",
          Department: e.service || e.societe || "",
          ManagerId: e.managerId || null,
          Email: e.email || "",
          IsActive: e.estActif !== false,
        }));
        setEmployees(sfEmployees);
        setLoading(false);
      } catch (err) {
        console.error("Erreur chargement organigramme RH:", err);
        setError(err.message || "Erreur de chargement");
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = employees.filter(e => {
    if (showOnlyActive && e.IsActive === false) return false;
    const q = search.toLowerCase();
    return (
      e.Name.toLowerCase().includes(q) ||
      (e.Title || "").toLowerCase().includes(q) ||
      (e.Department || "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingRight: selected ? 300 : 0 }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.1em" }}>HOLDING G2L</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Organigramme</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un salarié..." style={{ padding: "8px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 13, width: 220, outline: "none" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}>
            <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} style={{ cursor: "pointer" }} />
            Salariés actifs uniquement
          </label>
          <span style={{ fontSize: 12, color: "#999" }}>{filtered.length} / {employees.length} salariés</span>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", borderBottom: "1px solid #fecaca", padding: "8px 32px", fontSize: 12 }}>
          Erreur de chargement : {error}
        </div>
      )}

      <div style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "0 32px", display: "flex" }}>
        {[{ key: "hierarchical", label: "Hiérarchique" }, { key: "structural", label: "Structurel" }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: "none", border: "none", cursor: "pointer", borderBottom: `2px solid ${tab === key ? "#1a73e8" : "transparent"}`, color: tab === key ? "#1a73e8" : "#666", padding: "14px 24px 12px", fontSize: 13, fontWeight: tab === key ? 600 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 80, color: "#999" }}>Chargement...</div>}
      {!loading && tab === "hierarchical" && <HierarchyView employees={filtered} onSelect={setSelected} selectedId={selected?.Id} />}
      {!loading && tab === "structural" && <StructuralView employees={filtered} onSelect={setSelected} selectedId={selected?.Id} />}

      <DetailPanel employee={selected} allEmployees={employees} onClose={() => setSelected(null)} />
    </div>
  );
}
