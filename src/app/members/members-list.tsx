"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  resetCalendarData,
  toggleMemberModerator,
  updateMemberName,
} from "./actions";

type Member = {
  id: string;
  name: string;
  email: string;
  is_moderator: boolean;
  last_reviewed_at: string | null;
};

type Props = {
  members: Member[];
  currentUserId: string;
  currentUserIsModerator: boolean;
};

type Patch = {
  id: string;
  name?: string;
  is_moderator?: boolean;
};

type SaveChanges = {
  newName?: string;
  newModerator?: boolean;
};

export function MembersList({
  members,
  currentUserId,
  currentUserIsModerator,
}: Props) {
  const [optimisticMembers, applyPatch] = useOptimistic<Member[], Patch>(
    members,
    (state, patch) =>
      state.map((m) =>
        m.id === patch.id
          ? {
              ...m,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.is_moderator !== undefined
                ? { is_moderator: patch.is_moderator }
                : {}),
            }
          : m
      )
  );
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  function handleSave(id: string, changes: SaveChanges) {
    setEditing(null);
    if (changes.newName === undefined && changes.newModerator === undefined) {
      return;
    }
    startTransition(async () => {
      applyPatch({
        id,
        ...(changes.newName !== undefined ? { name: changes.newName } : {}),
        ...(changes.newModerator !== undefined
          ? { is_moderator: changes.newModerator }
          : {}),
      });
      try {
        const promises: Promise<void>[] = [];
        if (changes.newName !== undefined) {
          promises.push(updateMemberName(id, changes.newName));
        }
        if (changes.newModerator !== undefined) {
          promises.push(toggleMemberModerator(id));
        }
        await Promise.all(promises);
      } catch (err) {
        console.error("Member save failed:", err);
      }
    });
  }

  return (
    <main className="min-h-screen bg-white pb-12">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Members</h1>
          <nav className="flex items-center gap-3 text-sm text-gray-600">
            <a href="/calendar" className="hover:text-gray-900">
              My Availability
            </a>
            <span aria-hidden="true" className="text-gray-300">
              ·
            </span>
            <a href="/" className="hover:text-gray-900">
              Home
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-md px-3">
        <ul className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {optimisticMembers.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === currentUserId}
              currentUserIsModerator={currentUserIsModerator}
              isEditing={editing === m.id}
              onEdit={() => setEditing(m.id)}
              onCancel={() => setEditing(null)}
              onSave={(changes) => handleSave(m.id, changes)}
            />
          ))}
        </ul>

        {currentUserIsModerator && <DangerZone />}
      </div>
    </main>
  );
}

function DangerZone() {
  const [showModal, setShowModal] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function openModal() {
    setResetInput("");
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    if (resetting) return;
    setShowModal(false);
    setResetInput("");
    setError(null);
  }

  async function handleConfirm() {
    if (resetInput !== "RESET" || resetting) return;
    setResetting(true);
    setError(null);
    try {
      const result = await resetCalendarData();
      if (result.ok) {
        setShowModal(false);
        setResetInput("");
        setSuccessMessage(result.message);
        window.setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(`Reset failed: ${result.message}`);
      }
    } catch (err) {
      // Network or runtime error before the action returned cleanly.
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Reset failed: ${msg}`);
    } finally {
      setResetting(false);
    }
  }

  const canConfirm = resetInput === "RESET" && !resetting;

  return (
    <section className="mt-8 rounded-lg border-2 border-red-300 bg-red-50 p-4">
      <h2 className="text-base font-semibold text-red-900">Danger zone</h2>
      <p className="mt-1 text-sm text-red-800">
        Wipes everyone&apos;s availability, finalized meetings, and last-reviewed
        timestamps. User accounts, names, and moderator status are preserved.
      </p>
      <button
        type="button"
        onClick={openModal}
        className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Reset calendar data
      </button>

      {successMessage && (
        <p className="mt-3 rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800">
          {successMessage}
        </p>
      )}

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900">
              Reset all calendar data?
            </h3>

            <div className="mt-3 space-y-2 text-sm text-gray-700">
              <p>This will permanently delete:</p>
              <ul className="ml-4 list-disc text-gray-600">
                <li>Every member&apos;s availability rows</li>
                <li>All finalized meetings</li>
                <li>All last-reviewed timestamps</li>
              </ul>
              <p>The following are preserved:</p>
              <ul className="ml-4 list-disc text-gray-600">
                <li>User accounts and emails</li>
                <li>Names and moderator flags</li>
              </ul>
            </div>

            <label className="mt-4 block">
              <span className="block text-xs font-medium text-gray-700">
                Type <span className="font-mono font-semibold">RESET</span> to
                confirm
              </span>
              <input
                type="text"
                value={resetInput}
                onChange={(e) => setResetInput(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base font-mono"
              />
            </label>

            {error && (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={resetting}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MemberRow({
  member,
  isSelf,
  currentUserIsModerator,
  isEditing,
  onEdit,
  onCancel,
  onSave,
}: {
  member: Member;
  isSelf: boolean;
  currentUserIsModerator: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (changes: SaveChanges) => void;
}) {
  const [draftName, setDraftName] = useState(member.name);
  const [draftMod, setDraftMod] = useState(member.is_moderator);

  useEffect(() => {
    if (isEditing) {
      setDraftName(member.name);
      setDraftMod(member.is_moderator);
    }
  }, [isEditing, member.name, member.is_moderator]);

  if (!isEditing) {
    return (
      <li className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-medium text-gray-900">
                {member.name}
              </p>
              {member.is_moderator && (
                <span className="text-xs text-gray-400">(Moderator)</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-gray-600">
              {member.email}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {lastReviewedLabel(member.last_reviewed_at)}
            </p>
          </div>
          {(isSelf || currentUserIsModerator) && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
      </li>
    );
  }

  const canToggleModerator = currentUserIsModerator && !isSelf;

  function handleSave() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onSave({
      newName: trimmed !== member.name ? trimmed : undefined,
      newModerator:
        canToggleModerator && draftMod !== member.is_moderator
          ? draftMod
          : undefined,
    });
  }

  return (
    <li className="bg-gray-50 px-4 py-3">
      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-700">Name</span>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
        </label>

        {canToggleModerator && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draftMod}
              onChange={(e) => setDraftMod(e.target.checked)}
              className="h-5 w-5"
            />
            Moderator
          </label>
        )}
        {currentUserIsModerator && isSelf && (
          <p className="text-xs text-gray-500">
            You can&apos;t change your own moderator flag — ask another moderator
            to do it.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draftName.trim()}
            className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </li>
  );
}

function lastReviewedLabel(iso: string | null): string {
  if (!iso) return "Not yet reviewed";
  const reviewedAt = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - reviewedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 30) {
    return `Reviewed ${reviewedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Reviewed just now";
    return `Reviewed ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (diffDays === 1) return "Reviewed 1 day ago";
  return `Reviewed ${diffDays} days ago`;
}
