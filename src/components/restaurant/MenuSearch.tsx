import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  restaurantName: string;
}

const MenuSearch = ({ value, onChange, restaurantName }: Props) => (
  <div className="px-5 py-3">
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Rechercher ${restaurantName}…`}
        className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  </div>
);

export default MenuSearch;
