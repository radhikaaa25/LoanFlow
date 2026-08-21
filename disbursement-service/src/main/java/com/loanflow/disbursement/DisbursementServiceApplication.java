package com.loanflow.disbursement;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.loanflow")
public class DisbursementServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(DisbursementServiceApplication.class, args);
    }
}
