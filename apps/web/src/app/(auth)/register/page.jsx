import { RegisterForm } from '@/features/auth/register-form';

export const metadata = { title: 'Create account' };

export default async function RegisterPage({ searchParams }) {
  const { from } = await searchParams;
  return <RegisterForm accountMissing={from === 'login'} />;
}
