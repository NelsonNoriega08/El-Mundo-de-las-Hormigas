// Constantes y Funciones de Utilidad

// Constante hipotética de consumo:
// Asumimos que 1 millón de hormigas (10^6) consumen 1 kg en 3600 segundos (1 hora).
const ANTS_PER_KG_HOUR = 1000000;
const SECONDS_PER_HOUR = 3600;
// La constante de tiempo base (T_base) es el tiempo que 1 hormiga tardaría en comer 1 kg.
// T_base = ANTS_PER_KG_HOUR * SECONDS_PER_HOUR
const BASE_TIME_CONSTANT = ANTS_PER_KG_HOUR * SECONDS_PER_HOUR; // 3,600,000,000 segundos

/**
 * Convierte una cantidad de segundos en un formato legible (h:m:s).
 * @param {number} totalSeconds - Los segundos totales a convertir.
 * @returns {string} El tiempo formateado.
 */
function formatTime(totalSeconds) {
    // Redondear al segundo más cercano
    totalSeconds = Math.round(totalSeconds);

    if (totalSeconds < 60) {
        return `${totalSeconds} segundos`;
    }

    const days = Math.floor(totalSeconds / (24 * SECONDS_PER_HOUR));
    let remainingSeconds = totalSeconds % (24 * SECONDS_PER_HOUR);

    const hours = Math.floor(remainingSeconds / SECONDS_PER_HOUR);
    remainingSeconds %= SECONDS_PER_HOUR;

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} día${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hora${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`);

    return parts.join(', ');
}


/**
 * Función principal para realizar el cálculo.
 */
function calculateTime() {
    // 1. Obtener los valores de los inputs
    const antCountInput = document.getElementById('ant-count');
    const animalWeightInput = document.getElementById('animal-weight');
    const animalTypeInput = document.getElementById('animal-type');
    const resultBox = document.getElementById('result');

    const antCount = parseFloat(antCountInput.value);
    const animalWeight = parseFloat(animalWeightInput.value);
    const animalType = animalTypeInput.value.trim() || "el animal"; // Usar "el animal" si está vacío

    // 2. Validación de datos
    resultBox.classList.remove('error'); // Limpiar cualquier estilo de error previo

    if (isNaN(antCount) || antCount <= 0) {
        resultBox.innerHTML = `⚠️ Error: La cantidad de hormigas debe ser un número positivo.`;
        resultBox.classList.add('error');
        return;
    }

    if (isNaN(animalWeight) || animalWeight <= 0) {
        resultBox.innerHTML = `⚠️ Error: El peso del animal debe ser un número positivo (en kg).`;
        resultBox.classList.add('error');
        return;
    }

    // 3. Cálculo Hipotético
    
    // Fórmula:
    // Tiempo_total (s) = (BASE_TIME_CONSTANT * Peso_Animal (kg)) / Cantidad_Hormigas
    
    const timeInSeconds = (BASE_TIME_CONSTANT * animalWeight) / antCount;

    // 4. Formatear el resultado
    const formattedTime = formatTime(timeInSeconds);

    // 5. Mostrar el resultado
    const totalAnts = antCount.toLocaleString('es-ES');
    const totalWeight = animalWeight.toLocaleString('es-ES');
    
    resultBox.innerHTML = `
        <p>Una colonia de <span style="color:#d32f2f;">${totalAnts}</span> hormigas tardaría aproximadamente:</p>
        <p style="font-size:1.5em; margin: 10px 0; color:#4a230f;">${formattedTime}</p>
        <p>en consumir ${totalWeight} kg de <span style="font-style: italic;">${animalType}</span>.</p>
    `;
}

// 6. Enlazar la función al botón cuando la página se cargue
document.addEventListener('DOMContentLoaded', () => {
    const calculateButton = document.getElementById('calculate-btn');
    
    // Asignar el evento click al botón
    calculateButton.addEventListener('click', calculateTime);
    
    // Opcional: Ejecutar un cálculo inicial al cargar la página
    calculateTime();
});