import type { Metadata } from "next";

// Public page about Echo: no sign-in. It is the "application home page" on
// Echo's Google sign-in screen, so it has to say, to anyone, what Echo is and
// what it does with Google Calendar data, under the same name ("Echo") that
// the consent screen shows. Keep it in step with public/echo/privacy.html.
export const metadata: Metadata = {
  title: "Echo",
  description:
    "Echo is Ecultify's meeting notes tool: it records a team member's Google Meet calls and writes the notes and action items into Ecultify's task tracker.",
};

export default function EchoHomePage() {
  return (
    <main className="mx-auto max-w-[720px] px-5 py-12 sm:py-16 text-[16px] leading-[26px] text-[var(--text-primary)]">
      <h1 className="text-[32px] leading-[38px] font-semibold">Echo</h1>
      <p className="mt-3 text-[18px] leading-[28px] text-[var(--text-secondary)]">
        Echo is the meeting notes tool of Ecultify, a creative agency. It records a team member&apos;s Google Meet
        calls and turns each one into notes and action items inside Ecultify&apos;s task tracker.
      </p>

      <h2 className="mt-10 text-[20px] font-semibold">What Echo does</h2>
      <ul className="mt-3 list-disc pl-5 flex flex-col gap-2">
        <li>
          A team member adds the Echo extension to their browser and links it to their task tracker account. When
          they are in a Google Meet call, Echo records the call and shows a notice on the meeting page with a Stop
          button.
        </li>
        <li>
          After the call, Echo transcribes the recording and writes a summary, the decisions, the open questions and
          the action items. These appear on that person&apos;s Meetings page in the task tracker.
        </li>
        <li>
          Notes from a client meeting are filed under that client&apos;s brand, and each action item is offered to
          the person it was given to, who can add it to their tasks.
        </li>
      </ul>
      <p className="mt-3">
        Echo is used by Ecultify&apos;s own team. It is not a public service and has no sign-up: accounts are created
        by Ecultify for its staff.
      </p>

      <h2 className="mt-10 text-[20px] font-semibold">How Echo uses Google Calendar</h2>
      <p className="mt-3">
        A team member can choose to connect their Google Calendar from their profile page. Echo asks for one
        permission, to see their calendar events, and it is read-only. Echo uses it for two things:
      </p>
      <ul className="mt-3 list-disc pl-5 flex flex-col gap-2">
        <li>to show that person today&apos;s meetings on their task tracker dashboard, each with a link to join;</li>
        <li>
          to find the invite for a meeting Echo recorded and read its title and its guests&apos; names and email
          addresses, so the notes say who was in the meeting and action items go to the right person.
        </li>
      </ul>
      <p className="mt-3">
        Echo never changes a calendar. It does not use calendar data for advertising and does not sell it. The
        connection can be removed at any time from the profile page or from the Google Account&apos;s security
        settings. The details, including who processes the data, are in the{" "}
        <a href="/echo/privacy.html" className="font-medium text-[var(--accent-admin-text)] underline underline-offset-2">
          privacy policy
        </a>
        .
      </p>
      <p className="mt-3">
        Echo&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--accent-admin-text)] underline underline-offset-2"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 className="mt-10 text-[20px] font-semibold">For Ecultify&apos;s team</h2>
      <p className="mt-3">
        Echo is set up from your profile in the task tracker.{" "}
        <a href="/sign-in" className="font-medium text-[var(--accent-admin-text)] underline underline-offset-2">
          Sign in to the task tracker
        </a>
        .
      </p>

      <h2 className="mt-10 text-[20px] font-semibold">Contact</h2>
      <p className="mt-3">
        Questions, or a request to delete a recording you were part of: ecultify@gmail.com.{" "}
        <a href="/echo/privacy.html" className="font-medium text-[var(--accent-admin-text)] underline underline-offset-2">
          Privacy policy
        </a>
      </p>
    </main>
  );
}
