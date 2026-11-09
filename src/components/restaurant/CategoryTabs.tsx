interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  activeCategory: string | null;
  onSelect: (id: string) => void;
}

const CategoryTabs = ({ categories, activeCategory, onSelect }: Props) => (
  <div className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-lg">
    <div className="flex gap-2 overflow-x-auto px-5 py-2.5 scrollbar-none">
      {categories.map((cat) => {
        const active = activeCategory === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
              active
                ? "bg-foreground text-background"
                : "bg-secondary text-muted-foreground hover:bg-muted"
            }`}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  </div>
);

export default CategoryTabs;
