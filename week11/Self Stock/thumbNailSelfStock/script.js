// Simple script to toggle active state on aisle/section buttons
document.querySelectorAll(".button-group").forEach(group => {
  group.addEventListener("click", e => {
    if (e.target.tagName === "BUTTON") {
      group.querySelectorAll("button").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
    }
  });
});

const products = [
  {
    id: "prod-1",
    name: "Product 1",
    upc: "000111222333",
    inStock: 24,
    floorLocation: "Aisle 1 - Shelf A1",
    backstockLocation: "Rack 3 - Bin 7",
    imageLabel: "Product 1"
  },
  {
    id: "prod-2",
    name: "Product 2",
    upc: "000111222334",
    inStock: 12,
    floorLocation: "Aisle 1 - Shelf A2",
    backstockLocation: "Rack 3 - Bin 8",
    imageLabel: "Product 2"
  },
  {
    id: "prod-3",
    name: "Product 3",
    upc: "000111222335",
    inStock: 18,
    floorLocation: "Aisle 1 - Shelf A3",
    backstockLocation: "Rack 3 - Bin 9",
    imageLabel: "Product 3"
  },
  {
    id: "prod-4",
    name: "Product 4",
    upc: "000111222336",
    inStock: 30,
    floorLocation: "Aisle 1 - Shelf A4",
    backstockLocation: "Rack 3 - Bin 10",
    imageLabel: "Product 4"
  },
  {
    id: "prod-5",
    name: "Product 5",
    upc: "000111222337",
    inStock: 8,
    floorLocation: "Aisle 2 - Shelf B1",
    backstockLocation: "Rack 4 - Bin 1",
    imageLabel: "Product 5"
  },
  {
    id: "prod-6",
    name: "Product 6",
    upc: "000111222338",
    inStock: 42,
    floorLocation: "Aisle 2 - Shelf B2",
    backstockLocation: "Rack 4 - Bin 2",
    imageLabel: "Product 6"
  },
  {
    id: "prod-7",
    name: "Product 7",
    upc: "000111222339",
    inStock: 5,
    floorLocation: "Aisle 2 - Shelf B3",
    backstockLocation: "Rack 4 - Bin 3",
    imageLabel: "Product 7"
  },
  {
    id: "prod-8",
    name: "Product 8",
    upc: "000111222340",
    inStock: 16,
    floorLocation: "Aisle 2 - Shelf B4",
    backstockLocation: "Rack 4 - Bin 4",
    imageLabel: "Product 8"
  }
];

const detailImage = document.getElementById("detail-image");
const detailName = document.getElementById("detail-name");
const detailUpc = document.getElementById("detail-upc");
const detailStock = document.getElementById("detail-stock");
const detailFloor = document.getElementById("detail-floor");
const detailBackstock = document.getElementById("detail-backstock");
const shelfRows = [
  document.getElementById("shelf-row-1"),
  document.getElementById("shelf-row-2")
];

const cardRegistry = new Map();

const createPlaceholderImage = label => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
      <rect width="200" height="260" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#334155" font-family="Arial, sans-serif" font-size="20">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const renderProductDetail = product => {
  detailImage.src = createPlaceholderImage(product.imageLabel);
  detailImage.alt = product.name;
  detailName.textContent = product.name;
  detailUpc.textContent = product.upc;
  detailStock.textContent = product.inStock;
  detailFloor.textContent = product.floorLocation;
  detailBackstock.textContent = product.backstockLocation;

  cardRegistry.forEach((btn, id) => {
    btn.classList.toggle("selected", id === product.id);
  });
};

products.forEach((product, index) => {
  const targetRow = index < 4 ? shelfRows[0] : shelfRows[1];
  const button = document.createElement("button");
  button.className = "product-card";
  button.type = "button";
  button.innerHTML = `
    <div class="product-card-image">
      <img src="${createPlaceholderImage(product.imageLabel)}" alt="${product.name}" />
    </div>
    <span class="product-card-name">${product.name}</span>
  `;

  button.addEventListener("click", () => renderProductDetail(product));

  cardRegistry.set(product.id, button);
  targetRow.appendChild(button);
});

// Show the first product by default
if (products.length) {
  renderProductDetail(products[0]);
}
