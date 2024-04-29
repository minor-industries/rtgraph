function consolidate(data) {
    let result = []

    let acc = [];

    
}


function interleave(data) {
    console.log(JSON.stringify(data, null, 2));

    data.forEach(series => {
        console.log(series.Pos);
        series.Samples.forEach(sample => {
            console.log(sample.Timestamp, sample.Value);
        })
    })
}

module.exports = interleave;