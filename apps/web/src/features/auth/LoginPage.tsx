import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../app/AuthProvider';
import { TextField } from '../../ui/Field';
import { Button } from '../../ui/Button';

interface FormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError((err as { message?: string })?.message ?? 'Login failed. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 dark:bg-bg-dark">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-md dark:border-border-dark dark:bg-surface-dark">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-base font-bold text-white">SD</div>
          <h1 className="text-lg font-bold text-content dark:text-content-dark">ServiceDesk</h1>
          <p className="text-sm text-content-muted dark:text-content-dark-muted">Service Engineering &amp; Job Card Management</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            required
            error={errors.email?.message}
            {...register('email', { required: 'Email is required' })}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password', { required: 'Password is required' })}
          />
          {serverError && (
            <p role="alert" className="text-sm text-danger">
              {serverError}
            </p>
          )}
          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-content-muted dark:text-content-dark-muted">
          Demo: coordinator@neotericgrp.in / Password123!
        </p>
      </div>
    </div>
  );
}
