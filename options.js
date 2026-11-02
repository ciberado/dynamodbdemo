import commandLineUsage from 'command-line-usage';
import commandLineArgs from 'command-line-args';

const MAX_PRESSURE = 25000;

export function parseOptions() {
  const sections = [
    {
      header : 'Dynapok',
      content : 'DynamoDB stressing pokémon demo.'  
    },
    {
      header: 'Options',
      optionList : [
        {
          name : 'help',
          type: Boolean,
          description : 'Print this help page.',
          alias: 'h'
        },
        {
          name : 'table',
          type: String,
          description : 'name of the DynamoDB table.',
          alias: 't'
        },
        {
          name : 'seconds',
          type: Number,
          description : 'number of seconds writting to the table.',
          defaultValue : 30,
          alias: 's',
          defaultOption: true
        },
        {
            name : 'pressure',
            type: Number,
            description : 'writes per second to the table',
            alias: 'p',
            defaultValue : 10
        },
        {
          name : 'region',
          type: String,
          description : 'region of the table',
          alias: 'r',
          defaultValue : 'eu-west-1'
        },
          
      ]
    }
  ];
  
  const options = commandLineArgs(sections[1].optionList);
  
  if ('help' in options) {
    console.log(commandLineUsage(sections));
    process.exit(0);
  }

  if (!options.table) {
    console.error('Table name is mandatory.');
    console.log(commandLineUsage(sections));
    process.exit(1);
  }  

  if (!Number.isInteger(options.seconds) || options.seconds < 1) {
    console.error('Seconds must be a positive integer.');
    process.exit(1);
  }

  if (!Number.isInteger(options.pressure) || options.pressure < 1 || options.pressure > MAX_PRESSURE) {
    console.error(`Pressure must be an integer between 1 and ${MAX_PRESSURE}.`);
    process.exit(1);
  }

  return options;
}
