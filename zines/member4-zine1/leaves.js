const container = document.querySelector(".leaf-container");

const leaves = ["🍁", "🍂", "🍁", "🍂"];

function createLeaf() {
  const leaf = document.createElement("span");

  leaf.className = "leaf";
  leaf.textContent = leaves[
    Math.floor(Math.random() * leaves.length)
  ];

  leaf.style.left = Math.random() * 100 + "vw";
  leaf.style.fontSize = (20 + Math.random() * 22) + "px";
  leaf.style.animationDuration = (3 + Math.random() * 3) + "s";

  container.appendChild(leaf);

  leaf.addEventListener("animationend", function () {
    leaf.remove();
  });
}

createLeaf();
setInterval(createLeaf, 180);