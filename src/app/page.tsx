import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white ring-1 ring-neutral-200">
            <span aria-hidden className="relative block h-7 w-7">
              <span className="absolute left-1/2 top-0 h-full w-2.5 -translate-x-1/2 bg-crf" />
              <span className="absolute left-0 top-1/2 h-2.5 w-full -translate-y-1/2 bg-crf" />
            </span>
          </div>
          <h1 className="text-xl font-semibold">Photothèque CRF Boulogne</h1>
          <p className="text-sm text-neutral-500">Saisissez le mot de passe qui vous a été communiqué.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
