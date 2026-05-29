const dailyes = document.querySelectorAll('.daily-menu');
const conteiner = document.getElementById('mounth');
const food = document.getElementById('no-food');

food.style.display = "none";

/*

function search(input) {
    
    const searchWord = input.value.toLowerCase().split(/\s+/);

dailyes.forEach(daily=>{
    const text = daily.textContent.toLowerCase();
    
    const matches = searchWord.every(word=> text.includes(word))

    if(matches){
        daily.style.display = "block";
        food.style.display = "none";
     
    }else{
        daily.style.display = "none";
        food.style.display = "block";
       
    }
    return;
})
       
}
*/

function search(input) {
    const searchWord = input.value.toLowerCase().split(/\s+/).filter(w => w !== "");
    let foundAny = false; // Variabile di controllo

    dailyes.forEach(daily => {
        const text = daily.textContent.toLowerCase();
        // Verifica se ogni parola della ricerca è presente nel testo
        const matches = searchWord.every(word => text.includes(word));

        if (matches) {
            daily.style.display = "block";
            foundAny = true; // Abbiamo trovato almeno un match
        } else {
            daily.style.display = "none";
        }
    });

    // Gestisci il messaggio "nessun cibo" solo alla fine del ciclo
    food.style.display = foundAny ? "none" : "block";
}





