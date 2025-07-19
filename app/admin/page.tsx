"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Admin Dashboard Component
function AdminDashboard() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to the admin control panel
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">User Management</h3>
          <p className="text-muted-foreground mb-4">
            Manage user accounts and permissions
          </p>
          <Button>Manage Users</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">System Settings</h3>
          <p className="text-muted-foreground mb-4">
            Configure system preferences
          </p>
          <Button>Settings</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Analytics</h3>
          <p className="text-muted-foreground mb-4">
            View system analytics and reports
          </p>
          <Button>View Analytics</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Database</h3>
          <p className="text-muted-foreground mb-4">
            Database management tools
          </p>
          <Button>Database Tools</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Logs</h3>
          <p className="text-muted-foreground mb-4">
            System logs and monitoring
          </p>
          <Button>View Logs</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Backup</h3>
          <p className="text-muted-foreground mb-4">
            Backup and restore operations
          </p>
          <Button>Backup System</Button>
        </Card>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            sessionStorage.removeItem("admin_authenticated");
            window.location.reload();
          }}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

// Login Form Component
function LoginForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Hash function using Web Crypto API
  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Hash the input password
      const hashedInput = await hashPassword(password);

      // Get the stored hash from environment variable
      // In production, you'll set NEXT_PUBLIC_ADMIN_PASSWORD_HASH in your environment
      const storedHash = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_HASH;

      if (!storedHash) {
        setError("Admin authentication not configured");
        setIsLoading(false);
        return;
      }

      // Compare hashes
      if (hashedInput === storedHash) {
        // Store authentication state in session storage
        sessionStorage.setItem("admin_authenticated", "true");
        onAuthenticated();
      } else {
        setError("Invalid password");
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setError("Authentication failed");
    }

    setIsLoading(false);
    setPassword(""); // Clear password field for security
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Admin Access</h1>
          <p className="text-muted-foreground">
            Enter admin password to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password}
          >
            {isLoading ? "Verifying..." : "Access Admin Panel"}
          </Button>
        </form>

        <div className="mt-6 text-xs text-muted-foreground">
          <p>⚠️ This area is restricted to authorized administrators only.</p>
        </div>
      </Card>
    </div>
  );
}

// Main Admin Page Component
export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const authenticated =
      sessionStorage.getItem("admin_authenticated") === "true";
    setIsAuthenticated(authenticated);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
