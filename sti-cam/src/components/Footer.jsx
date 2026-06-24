import { colors, font } from '../styles/theme';
import logoImg from '../assets/logo.png';

export default function Footer({ styleContent }) {
  return (
    <div style={{ ...styles.footer, ...styleContent }}>
      <img src={logoImg} alt="Os2group Logo" style={styles.logo} />
      <span style={styles.text}>by Os2group - 2026 | ver1.18.0</span>
    </div>
  );
}

const styles = {
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '24px 16px',
    marginTop: 'auto',
    width: '100%',
    zIndex: 10,
  },
  logo: {
    height: 20,
    width: 'auto',
    objectFit: 'contain',
    opacity: 0.8,
  },
  text: {
    fontSize: font.sm,
    color: colors.textDim,
    fontFamily: font.family,
    fontWeight: 500,
  }
};
