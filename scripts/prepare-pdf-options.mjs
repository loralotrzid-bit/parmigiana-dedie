import fs from 'node:fs';
const rid="(SELECT id FROM public.restaurants WHERE slug='la-parmigiana')";
const q=s=>"'"+s.replaceAll("'","''")+"'";
let sql='BEGIN;\n';
const descriptions={
Napoletana:'Tomate, mozzarella, anchois',
'Chicken crème':'Mozzarella, poulet, crème',
'Chicken tomate':'Mozzarella, poulet, tomate',
'4 fromages':'Tomate, mozzarella, gorgonzola, taleggio, parmesan',
Végétarienne:'Tomate, mozzarella, aubergine, poivrons, courgette, oignons rouges',
Prosciutto:'Tomate, mozzarella, jambon de dinde',
Tartufata:'Mozzarella, champignons, crème de truffe, tomates cerises',
'4 viandes':'Tomate, mozzarella, jambon, poulet, chorizo, chair à saucisse',
'Pizza du chef':'Tomate, mozzarella, jambon, aubergine, poulet, 4 fromages',
'Arancini bolognaise':'Fait maison. Sauce bolognaise, viande hachée, mozzarella',
'Panzerotti fritti':'Tomate, mozzarella',
'Pain à l’ail':'Avec mozzarella',
};
for(const [name,desc] of Object.entries(descriptions))sql+=`UPDATE public.products SET description=${q(desc)} WHERE name=${q(name)} AND category_id IN(SELECT id FROM public.categories WHERE restaurant_id=${rid});\n`;
function group(productFilter,name,options,{required=false,max=1,min=0,free=0}={}){
 sql+=`INSERT INTO public.product_option_groups(product_id,name,is_required,max_selections,min_selections,free_count,selection_type,sort_order) SELECT p.id,${q(name)},${required},${max},${min},${free},${q(max===1?'single':'multiple')},10 FROM public.products p JOIN public.categories c ON c.id=p.category_id WHERE c.restaurant_id=${rid} AND (${productFilter}) AND NOT EXISTS(SELECT 1 FROM public.product_option_groups g WHERE g.product_id=p.id AND g.name=${q(name)});\n`;
 for(const [label,price]of options)sql+=`INSERT INTO public.product_options(product_id,option_group_id,name,price_supplement) SELECT p.id,g.id,${q(label)},${price} FROM public.product_option_groups g JOIN public.products p ON p.id=g.product_id JOIN public.categories c ON c.id=p.category_id WHERE c.restaurant_id=${rid} AND (${productFilter}) AND g.name=${q(name)} AND NOT EXISTS(SELECT 1 FROM public.product_options o WHERE o.option_group_id=g.id AND o.name=${q(label)});\n`;
}
group("c.name='Pâtes'",'Supplément', [['Parmesan',2]]);
group("p.name='Escalope de veau'",'Accompagnement', [['Pâtes',0],['Frites et salade',0]],{required:true,min:1});
group("p.name='Escalope de veau'",'Sauce', [['Parmigiana',3.5],['4 fromages',3.5],['Sauce bolognaise',3.5],['Sauce champignon crème',2.5],['Sauce tomate',0],['Sauce crème',0],['Sauce tomate et crème',0]],{required:true,min:1});
group("p.name='Escalope de veau'",'Gratin', [['Gratinée',3.5]]);
group("p.name='Focaccia'",'Base', [['Avec tomate',0],['Sans tomate',0]],{required:true,min:1});
// Calzone farcito: two included ingredients; other extras remain separately priced.
const ingredients=['Anchois','Olives','Câpres','Artichauts','Oignon','Poivrons','Roquette','Oeuf','Pomme de terre','Ananas','Champignons','Crème','Ricotta','Parmesan','Crème balsamique','Miel','Aubergine','Courgette','Gorgonzola','Taleggio','Chorizo','Poulet','Tomates cerises','Sucuk','Lardons','Chair de saucisse','Thon','Double mozzarella','Jambon','Copeaux de parmesan','Raclette','Fromage de chèvre','Scampis','Fruits de mer','Saumon','Jambon de bœuf'];
group("p.name='Calzone farcito'",'Deux ingrédients inclus',ingredients.map(n=>[n+' (inclus)',0]),{required:true,max:2,min:2,free:2});
sql+='COMMIT;\n';fs.writeFileSync('../migration-prepared/pdf-options.sql',sql);
