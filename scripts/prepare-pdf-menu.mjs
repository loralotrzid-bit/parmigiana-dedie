import fs from 'node:fs';
// Transcription du PDF fourni le 26/10/2026. Tarifs sur place.
const pizzas = [
['Focaccia',8],['Marinara',9],['Margherita',11],['Funghi',12],['Carciofa',12],['Prosciutto',12],['Salsiccia',12],['Napoletana',12],['Bolognaise',13],['Pugliese',13],['Parmigiana',13],['Diavola',13],['Siciliana',13],['Modena',13],['Salsiccia e funghi',13],['Carolo',13],['Chèvre',13],['Caprese',13],['Hawaïenne',13],['Chicken crème',13],['Chicken tomate',13],['Calzone (fermée)',13],['Calzone farcito',14],['Veneziana',14],['Spéciale',14],['4 fromages',14],['Gustosa',14],['Ankara',14],['4 saisons',14],['Caprissosa',15],['Contadina',14],['Parisienne',14],['Romana',14],['Calabrese',14],['Lardière',15],['Végétarienne',15],['César',15],['Raclette',15],['Bianca neve',14],['Ricotina',15],['Tartufata',16],['Parma',16],['Norvegese',16],['Frutti di mare',16],['Scampis crème',16],['Scampis tomate',16],['Mari e monti',17],['4 viandes',17],['Pizza du chef',17],
];
const sections = {
  Pizzas: pizzas,
  Entrées: [['Arancini bolognaise',6],['Arancini 4 fromages',6],['Panzerotti fritti',5],['Pain à l’ail',5]],
  Pâtes: [['Penne Arrabiata',12],['Penne Jambon Crème',13],['Penne Poulet crème',14],['Penne Poulet tomate',14],['Penne Poulet tomate et crème',14],['Spaghetti Bolognaise',14],['Penne 4 Fromages',14],['Penne crème champignon',14],['Penne truffe',14],['Penne scampis crème',16],['Penne scampis tomate',16],['Penne scampis tomate et crème',16],['Spaghetti carbonara',16]],
  Escalopes: [['Escalope de veau',20]],
  Desserts: [['Demi-lune de nutella',5],['Tiramisu classique',6],['Tiramisu Speculoos',6],['Tiramisu pistaches',6]],
  'Cafés et infusions': [['Café expresso',2],['Café long',2.5],['Infusion thé (Lipton citron)',2.5],['Infusion thé (Lipton menthe)',2.5]],
  Boissons: [['Eau plate',2],['Eau pétillante',2],['Capri-Sun',2],['Hawai',2.5],['Schweppes',2.5],['Schweppes agrumes',2.5],['Coca Cola',2.5],['Coca Cola zéro',2.5],['Fanta orange',2.5],['Fanta citron',2.5],['Fanta exotique',2.5],['Tropico',2.5],['Ice Tea',2.5],['Ice Tea pêche',2.5],['Ice Tea green',2.5],['Oasis tropical',2.5],['Sprite',2.5],['Red Bull',3]],
};
const aliases = {
  Carciofa:'Pizza la carciofa',Prosciutto:'Pizza proscuitto','Chicken crème':'Pizza chicken','Calzone (fermée)':'Calzone (fermé)',Caprissosa:'Pizza capricciosa',Ricotina:'Pizza laricotina',
  'Demi-lune de nutella':'Demi lune de nutella','Tiramisu pistaches':'Tiramisu pistache','Eau pétillante':'Eau',
  'Coca Cola':'Coca-Cola 33cl','Coca Cola zéro':'Coca-Cola Zero 33cl','Fanta orange':'Fanta Orange 33cl','Fanta citron':'Fanta Lemon 33cl','Fanta exotique':'Fanta Exotic 33cl',Hawai:'Hawaï 33cl',Tropico:'Tropico Original 33cl','Ice Tea':'Ice Tea 33cl','Oasis tropical':'Oasis Tropical 33cl','Red Bull':'Red Bull 25cl',
};
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/^pizza\s+/,'').replace(/^la\s+/,'').replace(/[^a-z0-9]/g,'');
const existing = JSON.parse(fs.readFileSync('../migration-prepared/existing-products.json','utf8'));
const q = (s) => "'" + s.replaceAll("'","''") + "'";
let sql = 'BEGIN;\n';
const rid = "(SELECT id FROM public.restaurants WHERE slug='la-parmigiana')";
sql += `UPDATE public.restaurants SET digital_menu_enabled=true,takeaway_discount=1,delivery_mode='disabled' WHERE slug='la-parmigiana';\n`;
const used = new Set(); let categoryIndex=0;
for (const [category, products] of Object.entries(sections)) {
  sql += `INSERT INTO public.categories(restaurant_id,name,sort_order,is_published) SELECT ${rid},${q(category)},${categoryIndex++},true WHERE NOT EXISTS(SELECT 1 FROM public.categories WHERE restaurant_id=${rid} AND name=${q(category)});\n`;
  const cat = `(SELECT id FROM public.categories WHERE restaurant_id=${rid} AND name=${q(category)})`;
  for (const [i,[name,price]] of products.entries()) {
    const match = existing.filter((p)=>norm(p.name)===norm(aliases[name]||name));
    if (match.length>1) throw new Error('Ambiguous '+name);
    const weekend = category==='Pâtes'||category==='Escalopes';
    if (match.length) { used.add(match[0].id); sql+=`UPDATE public.products SET name=${q(name)},price=${price},sort_order=${i},is_published=true,category_id=${cat},weekend_only=${weekend} WHERE id=${q(match[0].id)};\n`; }
    else sql+=`INSERT INTO public.products(category_id,name,price,sort_order,weekend_only) VALUES(${cat},${q(name)},${price},${i},${weekend});\n`;
  }
}
if (used.size!==existing.length) throw new Error('Unmatched existing products: '+existing.filter(p=>!used.has(p.id)).map(p=>p.name).join(','));
const supp = [
['Anchois',2],['Olives',2],['Câpres',2],['Artichauts',2],['Oignon',2],['Poivrons',2],['Roquette',2],['Oeuf',2],['Pomme de terre',2],['Ananas',2],['Champignons',2],['Crème',2],['Ricotta',2],['Parmesan',2],['Crème balsamique',2],['Miel',2],
['Aubergine',3],['Courgette',3],['Gorgonzola',3],['Tallegio',3],['Chorizo',3],['Poulet',3],['Tomate cerise',3],['Sucuk',3],['Lardons',3],['Chair de saucisse',3],['Thon',3],['Double mozzarella',3],['Jambon de dinde',3],['Copeaux de parmesan',3],['Raclette',3],['Fromage de chèvre',3],['Scampis',3.5],['Fruits de mer',3.5],['Saumon',3.5],['Jambon de boeuf',3.5],
];
// Keep existing IDs; add only PDF options that are missing.
for (const groupName of ['Taille','Choix suppléments']) sql+=`INSERT INTO public.product_option_groups(product_id,name,max_selections,selection_type,sort_order) SELECT p.id,${q(groupName)},${groupName==='Taille'?1:36},${q(groupName==='Taille'?'single':'multiple')},${groupName==='Taille'?0:50} FROM public.products p JOIN public.categories c ON c.id=p.category_id WHERE c.restaurant_id=${rid} AND c.name='Pizzas' AND NOT EXISTS(SELECT 1 FROM public.product_option_groups g WHERE g.product_id=p.id AND g.name=${q(groupName)});\n`;
sql+=`UPDATE public.product_options o SET is_available=false FROM public.products p JOIN public.categories c ON c.id=p.category_id WHERE o.product_id=p.id AND c.restaurant_id=${rid} AND c.name='Pizzas';\n`;
for(const [groupName,options] of [['Taille',[['Pizza enfant',-1.5]]],['Choix suppléments',supp]]) for(const [name,price] of options) {
  sql+=`UPDATE public.product_options o SET price_supplement=${price},is_available=true FROM public.product_option_groups g JOIN public.products p ON p.id=g.product_id JOIN public.categories c ON c.id=p.category_id WHERE o.option_group_id=g.id AND g.name=${q(groupName)} AND o.name=${q(name)} AND c.restaurant_id=${rid} AND c.name='Pizzas';\n`;
  sql+=`INSERT INTO public.product_options(product_id,option_group_id,name,price_supplement) SELECT p.id,g.id,${q(name)},${price} FROM public.product_option_groups g JOIN public.products p ON p.id=g.product_id JOIN public.categories c ON c.id=p.category_id WHERE c.restaurant_id=${rid} AND c.name='Pizzas' AND g.name=${q(groupName)} AND NOT EXISTS(SELECT 1 FROM public.product_options o WHERE o.option_group_id=g.id AND o.name=${q(name)});\n`;
}
sql += 'COMMIT;\n';
fs.writeFileSync('../migration-prepared/pdf-menu.sql',sql);
fs.writeFileSync('docs/pdf-menu-transcription.json',JSON.stringify(sections,null,2));
console.log(JSON.stringify({sections:Object.keys(sections).length,products:Object.values(sections).flat().length,existingMatched:used.size}));
