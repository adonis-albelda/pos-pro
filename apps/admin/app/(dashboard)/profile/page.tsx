"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, Lock, Mail, Trash2, User as UserIcon, UserRound } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { changePassword } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorNote,
  Field,
  FileInput,
  Input,
  PageHeader,
  Skeleton,
  SuccessNote,
} from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import {
  useCurrentUser,
  useDeleteMyAvatar,
  useUpdateMe,
  useUploadMyAvatar,
} from "@/lib/query/session";
import { useUserRoles } from "@/lib/query/users";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProfilePage() {
  const { data: user, isPending } = useCurrentUser();
  const rolesQuery = useUserRoles();
  const roleLabel = rolesQuery.data?.find((r) => r.name === user?.role)?.label ?? user?.role;

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader icon={UserRound} title="My Profile" description="Your account details, photo, and password." />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader icon={UserRound} title="My Profile" />
        <Card className="px-4 py-8 text-center text-body text-danger">Could not load your profile.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={UserRound} title="My Profile" description="Your account details, photo, and password." />

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <AvatarCard avatarUrl={user.avatarUrl ?? null} name={user.name} />

        <div className="space-y-6">
          <DetailsCard
            name={user.name}
            email={user.email}
            username={user.username ?? null}
            roleLabel={roleLabel ?? "—"}
            isActive={user.isActive}
            lastLoginAt={user.lastLoginAt ?? null}
          />
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}

function AvatarCard({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const uploadAvatar = useUploadMyAvatar();
  const deleteAvatar = useDeleteMyAvatar();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      event.currentTarget.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
    uploadAvatar.mutate(file, {
      onSuccess: () => toast.success("Photo updated."),
      onError: (error) => {
        toast.error(errorMessage(error, "Could not upload the photo."));
        setPreview(null);
      },
      onSettled: () => {
        event.currentTarget.value = "";
      },
    });
  }

  function onRemove() {
    deleteAvatar.mutate(undefined, {
      onSuccess: () => {
        setPreview(null);
        toast.success("Photo removed.");
      },
      onError: (error) => toast.error(errorMessage(error, "Could not remove the photo.")),
    });
  }

  const shown = preview ?? avatarUrl;

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-paper">
          {shown ? (
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <UserIcon size={36} strokeWidth={2} className="text-ink-muted" />
          )}
        </span>
        <div>
          <p className="text-body-lg font-semibold text-ink">{name}</p>
        </div>
        <div className="flex w-full flex-col items-center gap-2">
          <label className="w-full cursor-pointer">
            <span className="sr-only">Upload photo</span>
            <FileInput
              accept="image/png,image/jpeg,image/webp"
              onChange={onChange}
              disabled={uploadAvatar.isPending}
            />
          </label>
          {shown ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              icon={Trash2}
              loading={deleteAvatar.isPending}
              onClick={onRemove}
            >
              Remove photo
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-ink-muted">PNG, JPEG or WebP, under 1 MB.</p>
      </CardBody>
    </Card>
  );
}

function DetailsCard({
  name,
  email,
  username,
  roleLabel,
  isActive,
  lastLoginAt,
}: {
  name: string;
  email: string | null;
  username: string | null;
  roleLabel: string;
  isActive: boolean;
  lastLoginAt: string | null;
}) {
  const updateMe = useUpdateMe();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    const form = new FormData(event.currentTarget);
    const nextName = String(form.get("name") ?? "").trim();
    const nextEmail = String(form.get("email") ?? "").trim() || null;
    const nextUsername = String(form.get("username") ?? "").trim() || null;

    if (!nextName) {
      setError("Name is required.");
      return;
    }
    if (!nextEmail && !nextUsername) {
      setError("Set an email or a username — your account needs at least one.");
      return;
    }
    if (nextUsername?.includes("@")) {
      setError("Username cannot look like an email address.");
      return;
    }

    updateMe.mutate(
      { name: nextName, email: nextEmail, username: nextUsername },
      {
        onSuccess: () => setSuccess(true),
        onError: (cause) => setError(errorMessage(cause, "Could not save your profile.")),
      },
    );
  }

  return (
    <Card>
      <CardHeader icon={UserRound} title="Account details" description="Your name, sign-in identifiers, and role." />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Full name" required>
            <Input name="name" defaultValue={name} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" hint="Sign-in by email requires it be verified.">
              <Input icon={Mail} name="email" type="email" defaultValue={email ?? ""} />
            </Field>
            <Field label="Username" hint="Cannot look like an email address.">
              <Input name="username" defaultValue={username ?? ""} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-caption text-ink-muted">Role</p>
              <Badge tone="neutral">{roleLabel}</Badge>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Status</p>
              <Badge tone={isActive ? "success" : "danger"}>{isActive ? "Active" : "Inactive"}</Badge>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Last login</p>
              <p className="text-body text-ink">{formatWhen(lastLoginAt)}</p>
            </div>
          </div>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {success ? <SuccessNote>Profile saved.</SuccessNote> : null}
          <Button type="submit" icon={Check} loading={updateMe.isPending}>
            {updateMe.isPending ? "Saving..." : "Save changes"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("current_password") ?? "");
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    setPending(true);
    try {
      await changePassword(getBrowserApiClient(), { currentPassword, password });
      setSuccess(true);
      (event.target as HTMLFormElement).reset();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isValidation) {
        setError(cause.errors?.current_password?.[0] ?? "That current password is incorrect.");
      } else {
        setError(errorMessage(cause, "Could not change your password."));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader icon={KeyRound} title="Change password" description="Requires your current password." />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Current password" required>
            <PasswordInput icon={Lock} name="current_password" autoComplete="current-password" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" required>
              <PasswordInput icon={Lock} name="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Confirm password" required>
              <PasswordInput icon={Lock} name="confirm" autoComplete="new-password" minLength={8} required />
            </Field>
          </div>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {success ? <SuccessNote>Password changed.</SuccessNote> : null}
          <Button type="submit" icon={Check} loading={pending}>
            {pending ? "Saving..." : "Change password"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
