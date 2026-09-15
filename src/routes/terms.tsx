import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Kamkazi" },
      { name: "description", content: "Terms of use for the Kamkazi personal productivity app." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold tracking-tight">Terms of Use</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Last updated: 15 September 2026 · Kamkazi · operated by Shantanu Chaturvedi, Dehradun, India
        </p>

        <div className="mt-8 space-y-7 text-[14px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-[16.5px] font-bold tracking-tight">1. The service</h2>
            <p className="mt-2">
              Kamkazi is a private, personal productivity web application operated by its owner
              for their own use. There is no public registration, subscription, or fee. Access is
              limited to the operator's account.
            </p>
          </section>
          <section>
            <h2 className="text-[16.5px] font-bold tracking-tight">2. Google account access</h2>
            <p className="mt-2">
              By connecting a Google account you grant Kamkazi read-only access to Calendar
              events and Gmail messages as described in the{" "}
              <Link to="/privacy" className="font-semibold text-primary underline">
                Privacy Policy
              </Link>
              . You can disconnect at any time from Settings or from your Google Account
              security settings.
            </p>
          </section>
          <section>
            <h2 className="text-[16.5px] font-bold tracking-tight">3. Availability</h2>
            <p className="mt-2">
              The app runs on self-hosted infrastructure with no uptime guarantee. Features may
              change or be discontinued at any time.
            </p>
          </section>
          <section>
            <h2 className="text-[16.5px] font-bold tracking-tight">4. Disclaimers</h2>
            <p className="mt-2">
              The app and its AI-generated summaries are provided "as is" without warranties of
              any kind. AI-generated content may contain errors and should be verified before
              being relied upon.
            </p>
          </section>
          <section>
            <h2 className="text-[16.5px] font-bold tracking-tight">5. Contact</h2>
            <p className="mt-2">
              <a href="mailto:shantanu@kamkazi.com" className="font-semibold text-primary underline">
                shantanu@kamkazi.com
              </a>
            </p>
          </section>
        </div>

        <p className="mt-10 text-[12.5px] text-muted-foreground">
          <Link to="/company" className="underline">
            ← Back to Kamkazi home
          </Link>
        </p>
      </main>
    </div>
  );
}