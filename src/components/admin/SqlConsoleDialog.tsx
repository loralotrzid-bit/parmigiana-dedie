import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Play, Database, Copy, Check, Bot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { safeToast } from "@/lib/safeToast";

interface SqlConsoleDialogProps {
  restaurantId: string;
  restaurantName: string;
}

interface SqlConsoleResult {
  message?: string;
  error?: string;
  rows?: unknown[];
}

const AI_PROMPT = (rid: string, rname: string) => `Tu es un expert SQL PostgreSQL. Génère du SQL pour le restaurant "${rname}" (ID: ${rid}).

Schéma des tables :
- categories (id uuid PK, restaurant_id uuid FK, name text, sort_order int, is_published bool default true, is_visible_to_client bool default true)
- products (id uuid PK, category_id uuid FK, name text, price numeric, description text, image_url text, is_available bool default true, is_published bool default true, is_featured bool default false, menu_label text, menu_supplement numeric, stock int, sort_order int)
- product_option_groups (id uuid PK, product_id uuid FK, name text, selection_type text default 'single', is_required bool default false, min_selections int default 0, max_selections int default 1, sort_order int, pricing_mode text default 'per_item', group_price numeric, free_count int default 0, is_menu_only bool default false, linked_category_id uuid)
- product_options (id uuid PK, product_id uuid FK, option_group_id uuid FK, name text, price_supplement numeric default 0, is_available bool default true, sort_order int)

Règles :
- Utilise des INSERT INTO avec des VALUES
- Pour les produits, fais un sous-select sur categories pour récupérer le category_id
- Pour les options, fais un sous-select sur product_option_groups pour récupérer l'option_group_id
- Génère du SQL prêt à exécuter, pas de placeholders

Ma demande : `;

const TEMPLATES = [
  {
    label: "Créer catégorie + produits",
    sql: (rid: string) => `-- Créer une catégorie et ses produits pour ${rid}
INSERT INTO categories (restaurant_id, name, sort_order) 
VALUES ('${rid}', 'Burgers', 0);

-- Récupérer l'ID de la catégorie créée et ajouter des produits
INSERT INTO products (category_id, name, price, sort_order)
SELECT c.id, p.name, p.price, p.sort_order
FROM categories c,
(VALUES 
  ('Classic Burger', 8.50, 0),
  ('Cheese Burger', 9.50, 1),
  ('Double Burger', 12.00, 2)
) AS p(name, price, sort_order)
WHERE c.restaurant_id = '${rid}' AND c.name = 'Burgers';`,
  },
  {
    label: "Menu complet (catégories + produits)",
    sql: (rid: string) => `-- Menu complet pour restaurant ${rid}
-- 1. Catégories
INSERT INTO categories (restaurant_id, name, sort_order) VALUES
('${rid}', 'Entrées', 0),
('${rid}', 'Plats', 1),
('${rid}', 'Desserts', 2),
('${rid}', 'Boissons', 3);

-- 2. Produits Entrées
INSERT INTO products (category_id, name, price, description, sort_order)
SELECT c.id, p.name, p.price, p.description, p.sort_order
FROM categories c,
(VALUES 
  ('Salade César', 7.50, 'Laitue, croûtons, parmesan', 0),
  ('Soupe du jour', 5.00, 'Préparation maison', 1)
) AS p(name, price, description, sort_order)
WHERE c.restaurant_id = '${rid}' AND c.name = 'Entrées';

-- 3. Produits Plats
INSERT INTO products (category_id, name, price, description, sort_order)
SELECT c.id, p.name, p.price, p.description, p.sort_order
FROM categories c,
(VALUES 
  ('Steak Frites', 14.50, 'Steak haché, frites maison', 0),
  ('Poulet Grillé', 12.00, 'Poulet fermier, légumes', 1)
) AS p(name, price, description, sort_order)
WHERE c.restaurant_id = '${rid}' AND c.name = 'Plats';

-- 4. Produits Boissons
INSERT INTO products (category_id, name, price, sort_order)
SELECT c.id, p.name, p.price, p.sort_order
FROM categories c,
(VALUES 
  ('Coca-Cola', 2.50, 0),
  ('Eau minérale', 1.50, 1),
  ('Jus d''orange', 3.00, 2)
) AS p(name, price, sort_order)
WHERE c.restaurant_id = '${rid}' AND c.name = 'Boissons';`,
  },
  {
    label: "Ajouter options à un produit",
    sql: (rid: string) => `-- Ajouter un groupe d'options
-- Remplacer PRODUCT_ID par l'ID du produit
INSERT INTO product_option_groups (product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
VALUES ('PRODUCT_ID', 'Sauce', 'single', true, 1, 1, 0);

-- Ajouter les options au groupe
INSERT INTO product_options (product_id, option_group_id, name, price_supplement, sort_order)
SELECT 'PRODUCT_ID', g.id, o.name, o.price, o.sort_order
FROM product_option_groups g,
(VALUES 
  ('Ketchup', 0, 0),
  ('Mayonnaise', 0, 1),
  ('Sauce Algérienne', 0.50, 2)
) AS o(name, price, sort_order)
WHERE g.product_id = 'PRODUCT_ID' AND g.name = 'Sauce';`,
  },
];

const SqlConsoleDialog = ({ restaurantId, restaurantName }: SqlConsoleDialogProps) => {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<SqlConsoleResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [open, setOpen] = useState(false);

  const executeMut = useMutation({
    mutationFn: async (sqlQuery: string) => {
      const { data, error } = await supabase.functions.invoke("sql-console", {
        body: { sql: sqlQuery },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SqlConsoleResult;
    },
    onSuccess: (data) => {
      setResult(data);
      safeToast.success(data.message || "SQL exécuté avec succès");
    },
    onError: (error: Error) => {
      setResult({ error: error.message });
      safeToast.error(error.message || "Erreur SQL");
    },
  });

  const handleTemplate = (templateFn: (rid: string) => string) => {
    setSql(templateFn(restaurantId));
    setResult(null);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(restaurantId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="rounded-lg bg-accent px-2 py-1.5 text-[11px] font-semibold text-accent-foreground hover:bg-accent/80 transition-colors"
          title="Console SQL"
        >
          <Database className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            Console SQL — {restaurantName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Restaurant ID */}
          <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
            <span className="text-xs text-muted-foreground">Restaurant ID:</span>
            <code className="text-xs font-mono text-foreground">{restaurantId}</code>
            <button onClick={handleCopyId} className="ml-auto text-muted-foreground hover:text-foreground">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* AI Prompt */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(AI_PROMPT(restaurantId, restaurantName));
              setCopiedPrompt(true);
              safeToast.success("Prompt IA copié ! Collez-le dans votre IA et décrivez le menu souhaité.");
              setTimeout(() => setCopiedPrompt(false), 3000);
            }}
            className="flex items-center gap-2 w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            {copiedPrompt ? "Prompt copié ✓" : "Copier le prompt IA (à coller dans ChatGPT / Lovable)"}
          </button>

          {/* Templates */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Templates rapides :</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => handleTemplate(t.sql)}
                  className="rounded-lg border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* SQL Input */}
          <Textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="Entrez votre SQL ici... (INSERT, SELECT, UPDATE sur les tables menu)"
            className="min-h-[200px] font-mono text-xs"
          />

          {/* Execute Button */}
          <Button
            onClick={() => executeMut.mutate(sql)}
            disabled={!sql.trim() || executeMut.isPending}
            className="w-full gap-2"
          >
            {executeMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Exécuter
          </Button>

          {/* Result */}
          {result && (
            <div className={`rounded-lg border p-3 ${result.error ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
              {result.error ? (
                <p className="text-xs text-destructive font-mono whitespace-pre-wrap">{result.error}</p>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-success mb-1">{result.message}</p>
                  {result.rows && result.rows.length > 0 && (
                    <pre className="text-[10px] text-foreground font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                      {JSON.stringify(result.rows, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SqlConsoleDialog;
