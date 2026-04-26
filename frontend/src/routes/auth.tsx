import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function destinationFor(roles: AppRole[]): "/ngo" | "/app" {
  return roles.includes("ngo") ? "/ngo" : "/app";
}

function AuthPage() {
  const { user, roles, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [signupRole, setSignupRole] = useState<"seeker" | "ngo">("seeker");

  useEffect(() => {
    if (!loading && user) navigate({ to: destinationFor(roles) });
  }, [user, roles, loading, navigate]);

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await signIn(String(fd.get("email")), String(fd.get("password")));
    setBusy(false);
    if (error) toast.error(error);
    // navigation happens via the useEffect once roles are loaded
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await signUp(
      String(fd.get("email")),
      String(fd.get("password")),
      String(fd.get("fullName")),
    );

    if (error) {
      setBusy(false);
      toast.error(error);
      return;
    }

    // If the user picked NGO, add the ngo role (default trigger gives 'seeker')
    if (signupRole === "ngo") {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (uid) {
        await supabase.from("user_roles").insert({ user_id: uid, role: "ngo" });
      }
    }

    setBusy(false);
    toast.success("Account created — you're signed in.");
    navigate({ to: signupRole === "ngo" ? "/ngo" : "/app" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lg">
        <Link to="/" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">Welcome to UNMAPPED</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in or create an account.</p>

        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={onSignIn} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="si-email">Email</Label>
                <Input id="si-email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="si-pw">Password</Label>
                <Input id="si-pw" name="password" type="password" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={onSignUp} className="mt-4 space-y-4">
              <div>
                <Label>I'm signing up as</Label>
                <RadioGroup
                  value={signupRole}
                  onValueChange={(v) => setSignupRole(v as "seeker" | "ngo")}
                  className="mt-2 grid grid-cols-2 gap-2"
                >
                  <Label
                    htmlFor="role-seeker"
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition ${
                      signupRole === "seeker" ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <RadioGroupItem id="role-seeker" value="seeker" />
                    Job seeker
                  </Label>
                  <Label
                    htmlFor="role-ngo"
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition ${
                      signupRole === "ngo" ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <RadioGroupItem id="role-ngo" value="ngo" />
                    NGO
                  </Label>
                </RadioGroup>
              </div>
              <div>
                <Label htmlFor="su-name">
                  {signupRole === "ngo" ? "Organisation name" : "Full name"}
                </Label>
                <Input id="su-name" name="fullName" required maxLength={120} />
              </div>
              <div>
                <Label htmlFor="su-email">Email</Label>
                <Input id="su-email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="su-pw">Password</Label>
                <Input id="su-pw" name="password" type="password" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
