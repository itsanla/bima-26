import express from 'express';
import type{ Request, Response } from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';

dotenv.config()
const app = express()

app.use(morgan('common'))

const PORT = process.env.PORT

app.get('/',(req:Request, res:Response) => {
    res.json({
        "nama":"andi",
        "umur":20
    })
})

app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`)
})