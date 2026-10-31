import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold">Not found</h1>
      <p className="mt-2">
        No community or league here. <Link href="/">Pick a community</Link> or{" "}
        <Link href="/leagues">browse every league</Link>.
      </p>
    </>
  );
}
