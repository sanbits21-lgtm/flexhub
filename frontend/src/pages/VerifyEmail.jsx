import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    const token = params.get('token') || '';
    authAPI.verifyEmail(token)
      .then((r) => setState({ status: 'ok', approval: r.data.approvalStatus }))
      .catch((e) => setState({ status: 'error', message: e.response?.data?.message || 'Could not confirm your email.' }));
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-md space-y-3">
        {state.status === 'checking' && <p className="text-gray-600 dark:text-gray-300">Confirming your email...</p>}
        {state.status === 'ok' && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Email confirmed</h1>
            <p className="text-gray-700 dark:text-gray-200">
              {state.approval === 'approved'
                ? 'Your gym is approved. You can sign in now.'
                : 'Thank you. Our team will review your gym and email you as soon as it is approved. You will be able to sign in then.'}
            </p>
          </>
        )}
        {state.status === 'error' && (
          <>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">We couldn't confirm that</h1>
            <p role="alert" className="text-gray-700 dark:text-gray-200">{state.message}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">Go to <Link to="/signup" className="underline dark:text-accent">sign up</Link> and use "Send it again" to get a fresh link.</p>
          </>
        )}
        <Link to="/login" className="inline-block text-sm underline text-gray-700 dark:text-accent">Go to log in</Link>
      </div>
    </div>
  );
}
