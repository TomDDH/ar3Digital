
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import cleanup from 'rollup-plugin-cleanup';
import { terser } from "rollup-plugin-terser";
export default [
    {
      input: './src/index.js',
      output: {
        file: './dist/threeDigital.min.js',
        format: 'es'
      },
      plugins: [
        resolve({
          jsnext: true,
          main: true,
          browser: true,
        }),
        commonjs(),
        cleanup(),
        terser()  
      ],
    },
    
  ];