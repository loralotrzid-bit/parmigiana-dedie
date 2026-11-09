import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SuperAdminRoute from "@/components/SuperAdminRoute";
import { useAuth } from "@/contexts/useAuth";

vi.mock("@/contexts/useAuth", () => ({ useAuth: vi.fn() }));
const mockedUseAuth = vi.mocked(useAuth);

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/admin/alerts"]}>
      <Routes>
        <Route path="/admin/alerts" element={<SuperAdminRoute><div>Superadmin only</div></SuperAdminRoute>} />
        <Route path="/admin/login" element={<div>Admin login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SuperAdminRoute", () => {
  beforeEach(() => { cleanup(); vi.resetAllMocks(); });

  const authState = (isSuperAdmin: boolean) => ({
    user: null,
    session: null,
    isLoading: false,
    isAdmin: true,
    isSuperAdmin,
    restaurantId: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    impersonateRestaurant: vi.fn(),
  });

  it("redirects a restaurant admin away from a superadmin route", () => {
    mockedUseAuth.mockReturnValue(authState(false));
    renderGuard();
    expect(screen.getByText("Admin login")).toBeInTheDocument();
    expect(screen.queryByText("Superadmin only")).not.toBeInTheDocument();
  });

  it("allows the active superadmin", () => {
    mockedUseAuth.mockReturnValue(authState(true));
    renderGuard();
    expect(screen.getByText("Superadmin only")).toBeInTheDocument();
  });
});
