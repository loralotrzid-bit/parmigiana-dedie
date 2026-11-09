import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TableEntry from "@/pages/client/TableEntry";
import ServiceCallsPanel from "@/components/admin/ServiceCallsPanel";
import { getServiceTable, getTableServiceStatus, requestTableService, fetchServiceCalls, advanceServiceCall } from "@/services/tableService";

vi.mock("@/services/tableService", () => ({ getServiceTable: vi.fn(), getTableServiceStatus: vi.fn(), requestTableService: vi.fn(), fetchServiceCalls: vi.fn(), advanceServiceCall: vi.fn() }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ restaurantId: "restaurant" }) }));
const token = "11111111-1111-4111-8111-111111111111";
function wrapper(child: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{child}</QueryClientProvider>);
}
function entry() { return wrapper(<MemoryRouter initialEntries={[`/table/${token}`]}><Routes><Route path="/table/:token" element={<TableEntry />} /></Routes></MemoryRouter>); }
describe("table entry and shared staff board", () => {
  beforeEach(() => { cleanup(); vi.resetAllMocks(); vi.mocked(getServiceTable).mockResolvedValue({ table_number: 3, restaurant_name: "La Parmigiana" }); vi.mocked(getTableServiceStatus).mockResolvedValue(null); });
  it("passes the scanned capability to the menu and locks ordering while the call is active", async () => {
    vi.mocked(requestTableService).mockResolvedValue("pending");
    vi.mocked(getTableServiceStatus).mockResolvedValueOnce(null).mockResolvedValue("pending");
    entry();
    const link = await screen.findByRole("link", { name: /Commander sur RZ Food/ });
    expect(link).toHaveAttribute("href", `/menu/la-parmigiana?table_token=${token}`);
    fireEvent.click(screen.getByRole("button", { name: /Demander au serveur/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Le serveur arrive");
    expect(screen.queryByRole("link", { name: /Commander sur RZ Food/ })).not.toBeInTheDocument();
    expect(requestTableService).toHaveBeenCalledExactlyOnceWith(token);
  });
  it("restores the locked page after reload when the server still has an active call", async () => {
    vi.mocked(getTableServiceStatus).mockResolvedValue("acknowledged");
    entry();
    expect(await screen.findByRole("status")).toHaveTextContent("pris en charge");
    expect(screen.queryByRole("link", { name: /Commander sur RZ Food/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Demander au serveur/ })).not.toBeInTheDocument();
    expect(requestTableService).not.toHaveBeenCalled();
  });
  it("fails closed when it cannot verify the current service-call status", async () => {
    vi.mocked(getTableServiceStatus).mockRejectedValue(new Error("Status indisponible"));
    entry();
    expect(await screen.findByRole("alert")).toHaveTextContent("restent bloquées");
    expect(screen.queryByRole("link", { name: /Commander/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Demander au serveur/ })).not.toBeInTheDocument();
  });
  it("does not claim success when the call fails and allows retry", async () => {
    vi.mocked(requestTableService).mockRejectedValue(new Error("Appel non transmis")); entry();
    fireEvent.click(await screen.findByRole("button", { name: /Demander au serveur/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Appel non transmis");
    expect(screen.getByRole("button", { name: /Demander au serveur/ })).toBeEnabled();
  });
  it("does not display order/call actions for an invalid or inactive table", async () => {
    vi.mocked(getServiceTable).mockRejectedValue(new Error("Table inactive")); entry();
    expect(await screen.findByRole("alert")).toHaveTextContent("Table inactive");
    expect(screen.queryByRole("link", { name: /Commander/ })).not.toBeInTheDocument();
  });
  it("takes an active call in charge through the server RPC", async () => {
    vi.mocked(fetchServiceCalls).mockResolvedValue([{ id: "call", restaurant_id: "restaurant", table_id: "table", table_number: 3, status: "pending", created_at: "2026-10-31T12:00:00Z", acknowledged_by: null, resolved_at: null }]);
    vi.mocked(advanceServiceCall).mockResolvedValue(); wrapper(<ServiceCallsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Je m’en occupe/ }));
    await waitFor(() => expect(advanceServiceCall).toHaveBeenCalledWith("call", "acknowledged"));
  });
  it("notifies for a call that was already pending on the first admin load", async () => {
    const notify = vi.fn();
    class MockNotification {
      static permission: NotificationPermission = "granted";
      constructor(title: string, options?: NotificationOptions) { notify(title, options); }
    }
    vi.stubGlobal("Notification", MockNotification);
    vi.mocked(fetchServiceCalls).mockResolvedValue([{ id: "initial-call", restaurant_id: "restaurant", table_id: "table", table_number: 4, status: "pending", created_at: "2026-10-31T12:00:00Z", acknowledged_by: null, resolved_at: null }]);
    wrapper(<ServiceCallsPanel />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Appel de la table 4", expect.objectContaining({ requireInteraction: true })));
    vi.unstubAllGlobals();
  });
  it("shows connection failures instead of a misleading empty board", async () => {
    vi.mocked(fetchServiceCalls).mockRejectedValue(new Error("Chargement impossible")); wrapper(<ServiceCallsPanel />);
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent("Chargement impossible");
    expect(screen.queryByText("Aucun appel en attente.")).not.toBeInTheDocument();
  });
});
