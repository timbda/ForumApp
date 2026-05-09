"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  inviteMember,
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
  const [addOpen, setAddOpen] = useState(false);

  const editingMember = optimisticMembers.find((m) => m.id === editing) ?? null;

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
        if (changes.newName !== undefined && changes.newModerator !== undefined) {
          toast.success("Member updated");
        } else if (changes.newName !== undefined) {
          toast.success("Name updated");
        } else if (changes.newModerator !== undefined) {
          toast.success(
            changes.newModerator ? "Moderator role granted" : "Moderator role removed"
          );
        }
      } catch (err) {
        console.error("Member save failed:", err);
        const msg = err instanceof Error ? err.message : "Save failed";
        toast.error(msg);
      }
    });
  }

  return (
    <div>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {optimisticMembers.length}{" "}
            {optimisticMembers.length === 1 ? "member" : "members"} in the forum.
          </p>
        </div>
        {currentUserIsModerator && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add member
          </Button>
        )}
      </header>

      <div className="mx-auto mt-6 max-w-2xl">
        <Card>
          <ul className="divide-y divide-border">
            {optimisticMembers.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isSelf={m.id === currentUserId}
                currentUserIsModerator={currentUserIsModerator}
                onEdit={() => setEditing(m.id)}
              />
            ))}
          </ul>
        </Card>

        {currentUserIsModerator && <DangerZone />}
      </div>

      <EditDialog
        member={editingMember}
        open={editing !== null}
        isSelf={editingMember?.id === currentUserId}
        currentUserIsModerator={currentUserIsModerator}
        onClose={() => setEditing(null)}
        onSave={(changes) => editingMember && handleSave(editingMember.id, changes)}
      />

      <AddMemberDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function AddMemberDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [makeModerator, setMakeModerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setName("");
    setMakeModerator(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    onClose();
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await inviteMember(
        trimmedEmail,
        trimmedName,
        makeModerator
      );
      if (result.ok) {
        toast.success(result.message);
        onClose();
        reset();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              They&apos;ll receive an invite email with a link that signs them
              in.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                disabled={submitting}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                disabled={submitting}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={makeModerator}
                onChange={(e) => setMakeModerator(e.target.checked)}
                disabled={submitting}
                className="h-4 w-4 rounded border-input"
              />
              <span>Make moderator</span>
            </label>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  member,
  isSelf,
  currentUserIsModerator,
  onEdit,
}: {
  member: Member;
  isSelf: boolean;
  currentUserIsModerator: boolean;
  onEdit: () => void;
}) {
  const canEdit = isSelf || currentUserIsModerator;

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
          {initialsFromName(member.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {member.name}
          </p>
          {member.is_moderator && (
            <Badge variant="secondary" className="shrink-0">
              Moderator
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        <div className="mt-1.5">
          <ReviewedBadge iso={member.last_reviewed_at} />
        </div>
      </div>

      {canEdit && (
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
      )}
    </li>
  );
}

function ReviewedBadge({ iso }: { iso: string | null }) {
  const label = lastReviewedLabel(iso);
  if (iso === null) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {label}
      </Badge>
    );
  }
  const reviewedAt = new Date(iso).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const isRecent = Date.now() - reviewedAt <= thirtyDaysMs;
  if (isRecent) {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50">
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {label}
    </Badge>
  );
}

function EditDialog({
  member,
  open,
  isSelf,
  currentUserIsModerator,
  onClose,
  onSave,
}: {
  member: Member | null;
  open: boolean;
  isSelf: boolean;
  currentUserIsModerator: boolean;
  onClose: () => void;
  onSave: (changes: SaveChanges) => void;
}) {
  const [draftName, setDraftName] = useState(member?.name ?? "");
  const [draftMod, setDraftMod] = useState(member?.is_moderator ?? false);

  useEffect(() => {
    if (member) {
      setDraftName(member.name);
      setDraftMod(member.is_moderator);
    }
  }, [member]);

  if (!member) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent />
      </Dialog>
    );
  }

  const canToggleModerator = currentUserIsModerator && !isSelf;

  function handleSubmit() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onSave({
      newName: trimmed !== member!.name ? trimmed : undefined,
      newModerator:
        canToggleModerator && draftMod !== member!.is_moderator
          ? draftMod
          : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          {canToggleModerator && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draftMod}
                onChange={(e) => setDraftMod(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>Moderator</span>
            </label>
          )}

          {currentUserIsModerator && isSelf && (
            <p className="text-xs text-muted-foreground">
              You can&apos;t change your own moderator flag — ask another
              moderator to do it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!draftName.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DangerZone() {
  const [showDialog, setShowDialog] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setResetInput("");
    setError(null);
    setShowDialog(true);
  }

  function closeDialog() {
    if (resetting) return;
    setShowDialog(false);
    setResetInput("");
    setError(null);
  }

  async function handleConfirm(e: React.MouseEvent) {
    if (resetInput !== "RESET" || resetting) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setResetting(true);
    setError(null);
    try {
      const result = await resetCalendarData();
      if (result.ok) {
        setShowDialog(false);
        setResetInput("");
        toast.success(result.message);
      } else {
        setError(`Reset failed: ${result.message}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Reset failed: ${msg}`);
    } finally {
      setResetting(false);
    }
  }

  const canConfirm = resetInput === "RESET" && !resetting;

  return (
    <>
      <Separator className="my-6" />
      <Card className="border-destructive/30 bg-destructive/5">
        <div className="p-5">
          <h2 className="text-base font-semibold text-destructive">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wipes everyone&apos;s availability, finalized meetings, and
            last-reviewed timestamps. User accounts, names, and moderator
            status are preserved.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={openDialog}
            className="mt-4"
          >
            Reset calendar data
          </Button>
        </div>
      </Card>

      <AlertDialog
        open={showDialog}
        onOpenChange={(o) => { if (!o) closeDialog(); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all calendar data?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>This will permanently delete:</p>
                <ul className="ml-4 list-disc">
                  <li>Every member&apos;s availability rows</li>
                  <li>All finalized meetings</li>
                  <li>All last-reviewed timestamps</li>
                </ul>
                <p>The following are preserved:</p>
                <ul className="ml-4 list-disc">
                  <li>User accounts and emails</li>
                  <li>Names and moderator flags</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm">
              Type <span className="font-mono font-semibold">RESET</span> to
              confirm
            </Label>
            <Input
              id="reset-confirm"
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              className="font-mono"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              disabled={resetting}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm}
              onClick={handleConfirm}
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              {resetting ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
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
