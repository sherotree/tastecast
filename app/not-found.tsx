import Link from "next/link";

export default function NotFound() {
  return (
    <main className="narrow">
      <p className="kicker">Missing page</p>
      <h1>That page isn’t on the call sheet.</h1>
      <Link className="button" href="/">
        Back to the desk
      </Link>
    </main>
  );
}
