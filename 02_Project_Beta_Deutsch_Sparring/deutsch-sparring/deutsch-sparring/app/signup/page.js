import AuthCard from '../../components/AuthCard';

export const metadata = { title: 'Create account – wort.' };

// Only reachable when accounts are on (proxy.js sends everyone else to the app).
export default function SignupPage() {
  return <AuthCard initialMode="signup" />;
}
