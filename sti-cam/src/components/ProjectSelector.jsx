import { useState, useEffect } from 'react';
import { getProjects, addProject, removeProject, syncProjectsFromDrive } from '../config/projects';
import { colors, font, radius } from '../styles/theme';

const ICONS = ['🏗️', '🏥', '🏢', '🏘️', '🏊', '🏫', '🏭', '🏠', '🏰', '🏟️', '🏬', '🏛️'];

export default function ProjectSelector({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [projects, setProjects] = useState(() => getProjects());
  const [syncing, setSyncing] = useState(true);

  const current = projects.find((p) => p.id === selected);

  const refreshProjects = () => setProjects(getProjects());

  // Sync from Drive on mount
  useEffect(() => {
    syncProjectsFromDrive()
      .then((merged) => { setProjects(merged); })
      .catch((e) => { console.error('[ProjectSelector] sync failed:', e); })
      .finally(() => setSyncing(false));
  }, []);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const project = addProject(trimmed, newIcon);
    refreshProjects();
    onSelect(project.id);
    setNewName('');
    setNewIcon(ICONS[0]);
    setCreating(false);
    setOpen(false);
  };

  const handleDelete = (id) => {
    removeProject(id);
    refreshProjects();
    if (selected === id) onSelect(null);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button onClick={() => { setOpen(!open); setCreating(false); setConfirmDelete(null); }} style={styles.selector}>
        {syncing ? (
          <span style={{ color: colors.textMuted }}>Sincronizando...</span>
        ) : current ? (
          <span>{current.icon} {current.name}</span>
        ) : (
          <span style={{ color: colors.textMuted }}>Seleccionar proyecto...</span>
        )}
        <span style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <div style={styles.list}>
          {projects.map((p) => (
            <div key={p.id} style={{ ...styles.option, ...(selected === p.id ? styles.optionActive : {}) }}>
              {confirmDelete === p.id ? (
                <div style={styles.confirmRow}>
                  <span style={{ fontSize: 12, color: colors.error }}>Eliminar?</span>
                  <button onClick={() => handleDelete(p.id)} style={styles.confirmYes}>Sí</button>
                  <button onClick={() => setConfirmDelete(null)} style={styles.confirmNo}>No</button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { onSelect(p.id); setOpen(false); }}
                    style={styles.optionBtn}
                  >
                    <span>{p.icon}</span>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    {selected === p.id && <span style={{ color: colors.accent, fontWeight: 700 }}>✓</span>}
                  </button>
                  <button onClick={() => setConfirmDelete(p.id)} style={styles.deleteBtn}>✕</button>
                </>
              )}
            </div>
          ))}

          {!creating ? (
            <button onClick={() => setCreating(true)} style={styles.addBtn}>
              + Nuevo proyecto
            </button>
          ) : (
            <div style={styles.createForm}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del proyecto"
                style={styles.input}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div style={styles.iconGrid}>
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewIcon(icon)}
                    style={{ ...styles.iconBtn, ...(newIcon === icon ? styles.iconBtnActive : {}) }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <div style={styles.createActions}>
                <button onClick={() => setCreating(false)} style={styles.cancelBtn}>Cancelar</button>
                <button onClick={handleCreate} disabled={!newName.trim()} style={{ ...styles.saveBtn, ...(!newName.trim() ? styles.saveBtnDisabled : {}) }}>
                  Crear
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  selector: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '12px 16px', borderRadius: radius.lg,
    border: `1px solid ${colors.borderLight}`, background: colors.bgInput,
    color: colors.textWhite, fontSize: font.lg, cursor: 'pointer', textAlign: 'left',
    fontFamily: font.family,
  },
  list: {
    marginTop: 8, borderRadius: radius.lg, border: `1px solid ${colors.borderLight}`,
    background: colors.bgInput, overflow: 'hidden',
  },
  option: {
    display: 'flex', alignItems: 'center',
    borderBottom: '1px solid #29303d',
  },
  optionActive: { background: colors.accentLight },
  optionBtn: {
    display: 'flex', alignItems: 'center', gap: 10, flex: 1,
    padding: '14px 16px', border: 'none',
    background: 'transparent', color: colors.text, fontSize: font.base,
    cursor: 'pointer', textAlign: 'left', fontFamily: font.family,
  },
  deleteBtn: {
    padding: '8px 12px', border: 'none', background: 'transparent',
    color: colors.textDim, fontSize: 14, cursor: 'pointer',
    fontFamily: font.family,
  },
  confirmRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px', width: '100%',
  },
  confirmYes: {
    padding: '4px 12px', borderRadius: radius.sm, border: 'none',
    background: colors.error, color: 'white', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', fontFamily: font.family,
  },
  confirmNo: {
    padding: '4px 12px', borderRadius: radius.sm, border: `1px solid ${colors.borderLight}`,
    background: 'transparent', color: colors.text, fontSize: 12,
    cursor: 'pointer', fontFamily: font.family,
  },
  addBtn: {
    display: 'block', width: '100%', padding: '14px 16px',
    border: 'none', background: 'transparent',
    color: colors.textDim, fontSize: font.base, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left', fontFamily: font.family,
  },
  createForm: {
    padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    borderTop: '1px solid #29303d',
  },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: radius.md,
    border: `1px solid ${colors.borderLight}`, background: colors.bg,
    color: colors.textWhite, fontSize: font.base, fontFamily: font.family,
    outline: 'none', boxSizing: 'border-box',
  },
  iconGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    border: `1px solid ${colors.borderLight}`, background: 'transparent',
    fontSize: 18, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: {
    background: colors.accentLight, borderColor: colors.accent,
  },
  createActions: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: '8px 16px', borderRadius: radius.md,
    border: `1px solid ${colors.borderLight}`, background: 'transparent',
    color: colors.text, fontSize: font.sm, cursor: 'pointer', fontFamily: font.family,
  },
  saveBtn: {
    padding: '8px 16px', borderRadius: radius.md, border: 'none',
    background: colors.accent, color: 'white',
    fontSize: font.sm, fontWeight: 600, cursor: 'pointer', fontFamily: font.family,
  },
  saveBtnDisabled: {
    opacity: 0.4, cursor: 'default',
  },
};
