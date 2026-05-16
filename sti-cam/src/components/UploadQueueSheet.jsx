import { colors, radius, globalStyles } from '../styles/theme';

export default function UploadQueueSheet({ queue, onClose }) {
  return (
    <div style={styles.overlay}>
      <style>{globalStyles}</style>
      <div style={styles.header}>
        <span style={{ fontWeight: 600, fontSize: 14, color: colors.textWhite }}>
          Cola de subida
        </span>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>
      <div style={styles.list}>
        {queue.map((q) => (
          <div key={q.id} style={styles.item}>
            <div style={styles.thumb}>
              <img src={q.thumb} alt="" style={styles.img} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: colors.text }}>{q.name}</span>
              {q.status === 'uploading' || q.status === 'pending' ? (
                <div style={styles.progress}>
                  <div style={{ ...styles.progressFill, width: `${q.progress}%` }} />
                </div>
              ) : q.status === 'error' ? (
                <span style={{ fontSize: 11, color: colors.error, display: 'block' }}>
                  ✗ Error
                </span>
              ) : (
                <span style={{ fontSize: 11, color: colors.success, display: 'block' }}>
                  ✓ {q.size}
                </span>
              )}
            </div>
          </div>
        ))}
        {queue.length === 0 && (
          <p style={{ padding: 24, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>
            Sin fotos en cola
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '50vh', background: 'rgba(17,17,19,0.95)',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    zIndex: 30, animation: 'slideUp 0.25s ease',
    backdropFilter: 'blur(12px)',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', borderBottom: `1px solid ${colors.border}`,
  },
  closeBtn: {
    background: 'none', border: 'none', color: colors.textMuted,
    fontSize: 16, cursor: 'pointer',
  },
  list: { overflowY: 'auto', maxHeight: 'calc(50vh - 50px)' },
  item: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px', borderBottom: `1px solid ${colors.bgCard}`,
  },
  thumb: {
    width: 40, height: 40, borderRadius: radius.sm, overflow: 'hidden',
    flexShrink: 0, border: `1px solid ${colors.borderLight}`,
  },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  progress: {
    width: '100%', height: 3, borderRadius: 3,
    background: colors.borderLight, overflow: 'hidden', marginTop: 4,
  },
  progressFill: {
    height: '100%',
    background: `linear-gradient(90deg, ${colors.accent}, #A11212)`,
    borderRadius: 3, transition: 'width 0.3s ease',
  },
};
