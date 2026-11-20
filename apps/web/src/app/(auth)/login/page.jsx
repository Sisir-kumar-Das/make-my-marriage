import { LoginForm } from '@/features/auth/login-form';
export const metadata = { title: 'Log in' };
export default async function LoginPage({ searchParams }) {
  const { from } = await searchParams;
  return <LoginForm accountExists={from === 'registration'} />;
}
