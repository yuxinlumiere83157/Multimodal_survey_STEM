import { Link, useRouteError } from 'react-router-dom';

function ErrorPage() {
  const error = useRouteError();
  const message = error?.status === 404
    ? 'The page you opened is not part of this demo.'
    : 'Something went wrong while loading the demo.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 text-slate-900">
      <main className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Demo route unavailable</p>
        <h1 className="mt-3 text-3xl font-bold">Let&apos;s get you back to the survey</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">{message}</p>
        <Link to="/">
          <button className="mt-6 rounded-md bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700">
            Return to demo home
          </button>
        </Link>
      </main>
    </div>
  );
}

export default ErrorPage;
