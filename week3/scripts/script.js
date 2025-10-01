let cStage = document.getElementById("colorStage")
let cButton = document.getElementById("colorButton")


const wImage = document.getElementById("webbImage")
const wButton = document.getElementById("imageToggle")


let changeColor =function()
{
    let rComp = Math.random() * 255
    let gComp = Math.random() * 255
    let bComp = Math.random() * 255

    cStage.style.backgroundColor = "rgb(" + rComp + ", " + gComp + ", " + bComp + ")"
}

let toggleImage = () =>
{
    console.log()
}


wButton.addEventListener("click", toggleImage)
cButton.addEventListener("click", changeColor)
window.addEventListener("load", changeColor)