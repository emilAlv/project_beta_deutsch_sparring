import AuthCard from '../../components/AuthCard';

export const metadata = { title: 'Log in – wort.' };

// Only reachable when accounts are on (proxy.js sends everyone else to the app).
export default function LoginPage() {
  return <AuthCard initialMode="login" />;
}
