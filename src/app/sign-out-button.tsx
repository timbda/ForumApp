import { signOut } from "./sign-out-action";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="mt-4 rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-900 hover:bg-gray-50"
      >
        Sign out
      </button>
    </form>
  );
}
